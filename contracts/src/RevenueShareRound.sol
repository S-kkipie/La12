// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RevenueShareRound
/// @notice One funding round for one club. The contract itself is the
/// tradeable ERC-20 "share" — fans invest USD₮, receive shares 1:1 with
/// their pro-rata stake, and later claim a slice of club revenue via a
/// MasterChef-style cumulative-reward-per-share dividend pattern.
///
/// This is a revenue-share (economic rights) instrument, not equity: shares
/// carry a claim on distributed USD₮, not a claim on the club itself.
///
/// Lifecycle: Funding -> Active -> Closed.
///   Funding: fans call `invest`, minting shares.
///   Active:  club calls `distribute` to push revenue; holders `claim`.
///   Closed:  round is retired (see `closeRound`); no further distributions.
contract RevenueShareRound is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Funding,
        Active,
        Closed
    }

    // ---------------------------------------------------------------------
    // Scaling conventions (documented per spec §4 "pick one, document it")
    // ---------------------------------------------------------------------

    /// @notice Precision used for the cumulative accRewardPerShare accumulator
    /// (standard MasterChef-style dividend precision).
    uint256 public constant ACC_PRECISION = 1e12;

    /// @notice Basis-point denominator shared by `revenueBps` and
    /// `capMultiple`. `revenueBps = 800` means "8% of reported revenue goes
    /// to holders". `capMultiple = 15000` means "1.5x" (15000 / 10000).
    uint256 public constant BPS_DENOM = 10_000;

    /// @notice Share token uses 6 decimals (matches USD₮) so 1 sharePriceUsdt
    /// unit of USD₮ buys exactly `SHARE_UNIT / sharePriceUsdt` whole shares.
    uint256 public constant SHARE_UNIT = 1e6;

    // ---------------------------------------------------------------------
    // Immutable round parameters
    // ---------------------------------------------------------------------

    IERC20 public immutable usdt;
    address public immutable club;
    uint256 public immutable goal;
    uint256 public immutable sharePriceUsdt;
    uint256 public immutable revenueBps;
    uint256 public immutable capMultiple;
    uint256 public immutable deadline;

    // ---------------------------------------------------------------------
    // Mutable round state
    // ---------------------------------------------------------------------

    State public state;

    /// @notice Total USD₮ actually pulled in via `invest` (fixed once
    /// `closeFunding` runs; this — not `goal` — is the base for `capMultiple`).
    uint256 public totalRaised;

    /// @notice Cumulative reward per share, scaled by ACC_PRECISION.
    uint256 public accRewardPerShare;

    /// @notice Cumulative USD₮ ever credited to holders via `distribute`
    /// (post-cap). Compared against `capMultiple * totalRaised` to know how
    /// much distribution "room" remains.
    uint256 public totalDistributedToHolders;

    /// @dev Signed so mint/burn/transfer can adjust it symmetrically without
    /// underflow bookkeeping. See `_update`.
    mapping(address => int256) public rewardDebt;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event Invested(address indexed investor, uint256 usdtAmount, uint256 sharesMinted);
    event FundingClosed(uint256 totalRaisedUsdt, uint256 totalShares);
    event Distributed(uint256 revenueReceived, uint256 creditedToHolders, uint256 refundedToClub);
    event Claimed(address indexed holder, uint256 usdtAmount);
    event RoundClosed();

    constructor(
        string memory name_,
        string memory symbol_,
        address usdtToken,
        address club_,
        uint256 goal_,
        uint256 sharePriceUsdt_,
        uint256 revenueBps_,
        uint256 capMultiple_,
        uint256 deadline_
    ) ERC20(name_, symbol_) Ownable(club_) {
        require(usdtToken != address(0), "usdt=0");
        require(club_ != address(0), "club=0");
        require(goal_ > 0, "goal=0"); // else closeFunding trivially succeeds into Active with 0 supply
        require(sharePriceUsdt_ > 0, "price=0");
        // else 0 -> holders are never paid; > BPS_DENOM -> distribute underflows `revenue - credited`
        // (credited would exceed received) and reverts forever.
        require(revenueBps_ > 0 && revenueBps_ <= BPS_DENOM, "revenueBps out of range");
        require(capMultiple_ > 0, "capMultiple=0"); // else cap=0 and 100% of every distribute refunds to club
        // deadlines are day/week-scale; validator timestamp manipulation (~seconds) is immaterial here.
        // forge-lint: disable-next-line(block-timestamp)
        require(deadline_ > block.timestamp, "deadline in past");

        usdt = IERC20(usdtToken);
        club = club_;
        goal = goal_;
        sharePriceUsdt = sharePriceUsdt_;
        revenueBps = revenueBps_;
        capMultiple = capMultiple_;
        deadline = deadline_;
    }

    /// @notice Shares mirror USD₮'s 6 decimals to keep the invest math 1:1.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Disabled. `distribute`/`closeRound` are onlyOwner (== club);
    /// renouncing would permanently strand the round with no one able to
    /// ever call them again.
    function renounceOwnership() public pure override {
        revert("renounce disabled");
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /// @notice Invest USD₮ and receive shares pro-rata to `sharePriceUsdt`.
    /// shares = received * SHARE_UNIT / sharePriceUsdt.
    /// Example: sharePriceUsdt = 1e6 (1 USD₮/share), amount = 1e6 (1 USD₮)
    /// -> 1e6 shares minted (1.0 share, 6 decimals).
    /// @dev Credits shares off the balance actually RECEIVED (measured via
    /// balanceOf before/after), not the `amount` param — keeps the contract
    /// solvent if `usdt` ever turns out to be a fee-on-transfer token (real
    /// USD₮ isn't today, but this makes the guarantee unconditional).
    function invest(uint256 amount) external nonReentrant {
        require(state == State.Funding, "not funding");
        // forge-lint: disable-next-line(block-timestamp)
        require(block.timestamp <= deadline, "funding window closed");
        require(amount > 0, "zero amount");

        uint256 balBefore = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = usdt.balanceOf(address(this)) - balBefore;

        uint256 shares = (received * SHARE_UNIT) / sharePriceUsdt;
        require(shares > 0, "amount too small");

        totalRaised += received;
        _mint(msg.sender, shares);

        emit Invested(msg.sender, received, shares);
    }

    /// @notice Anyone may close funding once the goal is hit or the deadline
    /// has passed. Sweeps raised USD₮ to the club and flips to Active.
    function closeFunding() external nonReentrant {
        require(state == State.Funding, "not funding");
        // forge-lint: disable-next-line(block-timestamp)
        require(totalRaised >= goal || block.timestamp >= deadline, "goal/deadline not met");

        state = State.Active;

        uint256 amount = totalRaised;
        if (amount > 0) {
            usdt.safeTransfer(club, amount);
        }

        emit FundingClosed(amount, totalSupply());
    }

    // ---------------------------------------------------------------------
    // Distribution
    // ---------------------------------------------------------------------

    /// @notice Club reports revenue (e.g. gate/merch takings for a match);
    /// the contract pulls the full amount, credits `revenueBps` of it to
    /// holders (via accRewardPerShare), and immediately refunds the club
    /// the rest — both the (BPS_DENOM - revenueBps) portion it always keeps,
    /// and any part of the holder cut that would exceed `capMultiple *
    /// totalRaised` in lifetime distributions. This keeps the whole split
    /// enforced on-chain instead of trusting an off-chain calculation.
    /// @dev Restricted to the round owner, which is initialized to `club`
    /// in the constructor (Ownable(club_)) — i.e. only the club (or an
    /// address it delegates ownership to) can push a distribution.
    function distribute(uint256 revenue) external onlyOwner nonReentrant {
        require(state == State.Active, "not active");
        require(revenue > 0, "zero revenue");
        uint256 supply = totalSupply();
        require(supply > 0, "no holders");

        // Balance-delta, not the `revenue` param, for the same solvency reason as `invest`.
        uint256 balBefore = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(msg.sender, address(this), revenue);
        uint256 received = usdt.balanceOf(address(this)) - balBefore;

        uint256 holderCut = (received * revenueBps) / BPS_DENOM;

        uint256 cap = (totalRaised * capMultiple) / BPS_DENOM;
        uint256 room = cap > totalDistributedToHolders ? cap - totalDistributedToHolders : 0;
        uint256 credited = holderCut > room ? room : holderCut;

        if (credited > 0) {
            accRewardPerShare += (credited * ACC_PRECISION) / supply;
            totalDistributedToHolders += credited;
        }

        uint256 refund = received - credited;
        if (refund > 0) {
            usdt.safeTransfer(club, refund);
        }

        emit Distributed(received, credited, refund);
    }

    /// @notice Club retires the round once revenue-sharing is done for good
    /// (e.g. season over, cap reached). Permanently blocks further
    /// `distribute` calls; `claim` keeps working so holders can always
    /// withdraw whatever they'd already accrued.
    /// @dev The spec's state machine names `Closed` but doesn't specify its
    /// trigger — this fills that gap with the obvious club-gated transition.
    function closeRound() external onlyOwner {
        require(state == State.Active, "not active");
        state = State.Closed;
        emit RoundClosed();
    }

    /// @notice Pay out the caller's pending reward and settle their debt.
    /// @dev Caps the payout at the contract's actual USD₮ balance so that
    /// sub-wei rounding dust accumulated across many distributes/transfers
    /// (accRewardPerShare's floor division) can never make the last
    /// claimer's transaction revert.
    function claim() external nonReentrant {
        uint256 pending = pendingReward(msg.sender);
        require(pending > 0, "nothing to claim");

        uint256 payout = pending;
        uint256 available = usdt.balanceOf(address(this));
        if (payout > available) payout = available;

        rewardDebt[msg.sender] = _debtOf(msg.sender);
        usdt.safeTransfer(msg.sender, payout);

        emit Claimed(msg.sender, payout);
    }

    /// @notice Claimable USD₮ for `account` right now.
    function pendingReward(address account) public view returns (uint256) {
        int256 accrued = _debtOf(account) - rewardDebt[account];
        // safe: guarded by accrued > 0 immediately above.
        // forge-lint: disable-next-line(unsafe-typecast)
        return accrued > 0 ? uint256(accrued) : 0;
    }

    function _debtOf(address account) private view returns (int256) {
        // safe: balance * accRewardPerShare / ACC_PRECISION never approaches 2^255 at any
        // realistic USD₮ scale (accRewardPerShare itself is bounded by cumulative distributions).
        // forge-lint: disable-next-line(unsafe-typecast)
        return int256((balanceOf(account) * accRewardPerShare) / ACC_PRECISION);
    }

    // ---------------------------------------------------------------------
    // Reward-debt settlement on share movement
    // ---------------------------------------------------------------------

    /// @dev OZ v5 ERC20 hook covering mint (from == 0), burn (to == 0) and
    /// transfer. Every share movement must settle rewardDebt for both sides
    /// so accRewardPerShare accounting stays correct however shares move —
    /// this is what makes the share safely tradeable P2P later without any
    /// contract change.
    ///
    /// Derivation: pending(user) = balance*accRewardPerShare/ACC - debt(user)
    /// must be unchanged by a transfer of `value` shares for both sender and
    /// receiver (a transfer neither grants nor revokes already-accrued
    /// rewards). Solving for the debt adjustment that holds pending constant
    /// on both sides gives: debt[from] -= value*acc/ACC, debt[to] += value*
    /// acc/ACC. Mint/burn are the same formula with the zero address's delta
    /// skipped.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        uint256 debtDelta = (value * accRewardPerShare) / ACC_PRECISION;
        // safe: see _debtOf — same bound applies to this per-transfer delta.
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 signedDelta = int256(debtDelta);
        if (from != address(0)) {
            rewardDebt[from] -= signedDelta;
        }
        if (to != address(0)) {
            rewardDebt[to] += signedDelta;
        }
    }
}
