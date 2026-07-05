// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {RevenueShareRound} from "../src/RevenueShareRound.sol";
import {MaliciousUSDT} from "./mocks/MaliciousUSDT.sol";

contract RevenueShareRoundTest is Test {
    MockUSDT usdt;
    RevenueShareRound round;

    address club = makeAddr("club");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 constant GOAL = 10_000e6;
    uint256 constant SHARE_PRICE = 1e6; // 1 USD₮ per share -> 1:1 shares
    uint256 constant REVENUE_BPS = 800; // 8%
    uint256 constant CAP_MULTIPLE = 15_000; // 1.5x
    uint256 constant BPS_DENOM = 10_000;
    uint256 deadline;

    function setUp() public {
        usdt = new MockUSDT();
        deadline = block.timestamp + 90 days;

        round = new RevenueShareRound(
            "Deportivo San Martin Round 1",
            "DSM-R1",
            address(usdt),
            club,
            GOAL,
            SHARE_PRICE,
            REVENUE_BPS,
            CAP_MULTIPLE,
            deadline
        );

        usdt.mint(alice, 100_000e6);
        usdt.mint(bob, 100_000e6);
        usdt.mint(carol, 100_000e6);

        vm.prank(alice);
        usdt.approve(address(round), type(uint256).max);
        vm.prank(bob);
        usdt.approve(address(round), type(uint256).max);
        vm.prank(carol);
        usdt.approve(address(round), type(uint256).max);
    }

    // -- helpers ----------------------------------------------------------

    function _invest(address who, uint256 amount) internal {
        vm.prank(who);
        round.invest(amount);
    }

    /// @dev Invests for whichever of alice/bob/carol get a non-zero amount,
    /// then closes funding (warping to the deadline covers the case where
    /// the goal wasn't hit).
    function _activate(uint256 aliceAmt, uint256 bobAmt, uint256 carolAmt) internal {
        if (aliceAmt > 0) _invest(alice, aliceAmt);
        if (bobAmt > 0) _invest(bob, bobAmt);
        if (carolAmt > 0) _invest(carol, carolAmt);
        vm.warp(deadline);
        round.closeFunding();
    }

    function _fundClubForRevenue(uint256 amount) internal {
        usdt.mint(club, amount);
        vm.prank(club);
        usdt.approve(address(round), type(uint256).max);
    }

    // -- decimals -----------------------------------------------------------

    function test_Decimals() public view {
        assertEq(usdt.decimals(), 6, "usdt is 6 decimals");
        assertEq(round.decimals(), 6, "share mirrors usdt decimals");
    }

    // -- invest ---------------------------------------------------------

    function test_InvestMintsCorrectShares() public {
        _invest(alice, 1_000e6);

        assertEq(round.balanceOf(alice), 1_000e6, "1:1 at sharePrice=1e6");
        assertEq(round.totalRaised(), 1_000e6);
        assertEq(usdt.balanceOf(address(round)), 1_000e6);
    }

    function test_InvestRespectsSharePrice() public {
        // A second round priced at 2 USD₮/share should mint half as many shares.
        RevenueShareRound r2 =
            new RevenueShareRound("R2", "R2", address(usdt), club, GOAL, 2e6, REVENUE_BPS, CAP_MULTIPLE, deadline);

        vm.startPrank(alice);
        usdt.approve(address(r2), type(uint256).max);
        r2.invest(1_000e6);
        vm.stopPrank();

        assertEq(r2.balanceOf(alice), 500e6);
    }

    function test_MultipleInvestorsProRata() public {
        _invest(alice, 1_000e6);
        _invest(bob, 3_000e6);

        assertEq(round.balanceOf(alice), 1_000e6);
        assertEq(round.balanceOf(bob), 3_000e6);
        assertEq(round.totalSupply(), 4_000e6);
        assertEq(round.totalRaised(), 4_000e6);
    }

    function test_RevertWhen_InvestAfterDeadline() public {
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert("funding window closed");
        round.invest(1_000e6);
    }

    function test_RevertWhen_InvestNotInFunding() public {
        _activate(GOAL, 0, 0);

        vm.prank(bob);
        vm.expectRevert("not funding");
        round.invest(1_000e6);
    }

    function testFuzz_InvestMintsProRataShares(uint256 amount) public {
        amount = bound(amount, 1, 50_000e6);

        vm.prank(alice);
        round.invest(amount);

        // sharePrice == SHARE_UNIT here, so shares == amount exactly, no rounding.
        assertEq(round.balanceOf(alice), amount);
        assertEq(round.totalRaised(), amount);
        assertEq(usdt.balanceOf(address(round)), amount);
    }

    function testFuzz_TwoInvestorsSupplyMatchesRaised(uint256 aliceAmt, uint256 bobAmt) public {
        aliceAmt = bound(aliceAmt, 1, 50_000e6);
        bobAmt = bound(bobAmt, 1, 50_000e6);

        _invest(alice, aliceAmt);
        _invest(bob, bobAmt);

        assertEq(round.totalSupply(), round.totalRaised());
        assertEq(round.totalRaised(), aliceAmt + bobAmt);
    }

    // -- closeFunding -----------------------------------------------------

    function test_CloseFunding_GoalReached() public {
        _invest(alice, GOAL);
        round.closeFunding();

        assertEq(uint256(round.state()), uint256(RevenueShareRound.State.Active));
        assertEq(usdt.balanceOf(club), GOAL);
        assertEq(usdt.balanceOf(address(round)), 0);
    }

    function test_CloseFunding_DeadlinePassedBelowGoal() public {
        _invest(alice, 1_000e6); // short of GOAL
        vm.warp(deadline);
        round.closeFunding();

        assertEq(uint256(round.state()), uint256(RevenueShareRound.State.Active));
        assertEq(usdt.balanceOf(club), 1_000e6);
    }

    function test_RevertWhen_CloseFundingTooEarly() public {
        _invest(alice, 1_000e6); // short of goal, deadline untouched
        vm.expectRevert("goal/deadline not met");
        round.closeFunding();
    }

    // -- distribute ---------------------------------------------------------

    function test_DistributeUpdatesAccRewardPerShare() public {
        _activate(2_000e6, 2_000e6, 0); // 4_000e6 supply
        _fundClubForRevenue(100_000e6);

        vm.prank(club);
        round.distribute(1_000e6);

        uint256 expectedCredited = (1_000e6 * REVENUE_BPS) / BPS_DENOM; // 80e6
        uint256 expectedAcc = (expectedCredited * round.ACC_PRECISION()) / round.totalSupply();

        assertEq(round.accRewardPerShare(), expectedAcc);
        assertEq(round.totalDistributedToHolders(), expectedCredited);
    }

    function test_RevertWhen_DistributeNotActive() public {
        _fundClubForRevenue(1_000e6);
        vm.prank(club);
        vm.expectRevert("not active");
        round.distribute(1_000e6);
    }

    function test_RevertWhen_DistributeCallerNotClub() public {
        _activate(1_000e6, 0, 0);
        _fundClubForRevenue(1_000e6);

        vm.prank(alice);
        vm.expectRevert();
        round.distribute(1_000e6);
    }

    // -- claim: N-holder pro-rata payout ----------------------------------

    function test_ClaimProRataThreeHolders() public {
        _activate(1_000e6, 2_000e6, 3_000e6); // 6_000e6 supply
        _fundClubForRevenue(100_000e6);

        uint256 revenue = 10_000e6;
        vm.prank(club);
        round.distribute(revenue);

        uint256 credited = (revenue * REVENUE_BPS) / BPS_DENOM; // 800e6, well under the 9_000e6 cap
        uint256 acc = (credited * round.ACC_PRECISION()) / round.totalSupply();

        uint256 aliceExpected = (1_000e6 * acc) / round.ACC_PRECISION();
        uint256 bobExpected = (2_000e6 * acc) / round.ACC_PRECISION();
        uint256 carolExpected = (3_000e6 * acc) / round.ACC_PRECISION();

        assertEq(round.pendingReward(alice), aliceExpected);
        assertEq(round.pendingReward(bob), bobExpected);
        assertEq(round.pendingReward(carol), carolExpected);

        _claimAndAssertPaid(alice, aliceExpected);
        _claimAndAssertPaid(bob, bobExpected);
        _claimAndAssertPaid(carol, carolExpected);

        // fully settled: nothing left to claim, another claim reverts
        assertEq(round.pendingReward(alice), 0);
        vm.prank(alice);
        vm.expectRevert("nothing to claim");
        round.claim();
    }

    function _claimAndAssertPaid(address who, uint256 expected) internal {
        uint256 before = usdt.balanceOf(who);
        vm.prank(who);
        round.claim();
        assertEq(usdt.balanceOf(who), before + expected);
        assertEq(round.pendingReward(who), 0);
    }

    // -- cap enforcement ----------------------------------------------------

    function test_CapStopsRewardingAndRefundsExcessToClub() public {
        _activate(1_000e6, 0, 0); // totalRaised = 1_000e6, cap = 1.5x = 1_500e6
        _fundClubForRevenue(1_000_000e6);

        uint256 cap = (round.totalRaised() * CAP_MULTIPLE) / BPS_DENOM; // 1_500e6

        // 20_000e6 * 8% = 1_600e6 of holder-cut, over the 1_500e6 cap.
        uint256 revenue = 20_000e6;
        uint256 clubBalBefore = usdt.balanceOf(club);

        vm.prank(club);
        round.distribute(revenue);

        assertEq(round.totalDistributedToHolders(), cap, "credited caps out exactly at cap");
        // club is out only what actually stuck with holders; everything else came back.
        assertEq(usdt.balanceOf(club), clubBalBefore - cap);

        // Any further distribution credits nothing more — full amount refunds.
        uint256 clubBalBefore2 = usdt.balanceOf(club);
        vm.prank(club);
        round.distribute(5_000e6);

        assertEq(round.totalDistributedToHolders(), cap, "cap saturated, no further credit");
        assertEq(usdt.balanceOf(club), clubBalBefore2, "fully refunded, net zero for club");
    }

    // -- share transfers settle rewardDebt ---------------------------------

    function test_TransferSettlesRewardDebtForBothParties() public {
        _activate(2_000e6, 2_000e6, 0); // alice & bob equal holders, 4_000e6 supply
        _fundClubForRevenue(100_000e6);

        vm.prank(club);
        round.distribute(1_000e6); // first distribution, split evenly

        uint256 pendingAliceBefore = round.pendingReward(alice);
        uint256 pendingBobBefore = round.pendingReward(bob);
        assertEq(pendingAliceBefore, pendingBobBefore, "equal shares -> equal pending");
        assertEq(round.pendingReward(carol), 0);

        // alice sends half her shares to a fresh holder (carol) mid-round.
        uint256 transferAmt = 1_000e6;
        vm.prank(alice);
        bool ok = round.transfer(carol, transferAmt);
        assertTrue(ok);

        // the transfer itself must not move anyone's already-accrued pending.
        assertEq(round.pendingReward(alice), pendingAliceBefore, "sender keeps prior accrual");
        assertEq(round.pendingReward(carol), 0, "receiver gains no retroactive accrual");
        assertEq(round.balanceOf(alice), 1_000e6);
        assertEq(round.balanceOf(carol), 1_000e6);

        // second distribution now splits by the NEW share weights: alice 1_000e6,
        // bob 2_000e6, carol 1_000e6, out of an unchanged 4_000e6 supply.
        vm.prank(club);
        round.distribute(1_000e6);

        uint256 credited2 = (1_000e6 * REVENUE_BPS) / BPS_DENOM;
        uint256 accDelta = (credited2 * round.ACC_PRECISION()) / round.totalSupply();

        uint256 aliceExpected = pendingAliceBefore + (1_000e6 * accDelta) / round.ACC_PRECISION();
        uint256 bobExpected = pendingBobBefore + (2_000e6 * accDelta) / round.ACC_PRECISION();
        uint256 carolExpected = (1_000e6 * accDelta) / round.ACC_PRECISION();

        assertEq(round.pendingReward(alice), aliceExpected);
        assertEq(round.pendingReward(bob), bobExpected);
        assertEq(round.pendingReward(carol), carolExpected);

        // and each can actually walk away with exactly that much USD₮.
        _claimAndAssertPaid(alice, aliceExpected);
        _claimAndAssertPaid(bob, bobExpected);
        _claimAndAssertPaid(carol, carolExpected);
    }

    // -- closeRound -----------------------------------------------------

    function test_CloseRoundBlocksDistributeButNotClaim() public {
        _activate(1_000e6, 0, 0);
        _fundClubForRevenue(10_000e6);

        vm.prank(club);
        round.distribute(1_000e6);
        uint256 pending = round.pendingReward(alice);
        assertGt(pending, 0);

        vm.prank(club);
        round.closeRound();
        assertEq(uint256(round.state()), uint256(RevenueShareRound.State.Closed));

        vm.prank(club);
        vm.expectRevert("not active");
        round.distribute(1_000e6);

        // claim still pays out post-close.
        _claimAndAssertPaid(alice, pending);
    }

    // -- reentrancy -----------------------------------------------------

    function test_ClaimIsProtectedFromReentrancy() public {
        MaliciousUSDT evil = new MaliciousUSDT();
        RevenueShareRound evilRound = new RevenueShareRound(
            "Evil Round", "EVIL-R", address(evil), club, GOAL, SHARE_PRICE, REVENUE_BPS, CAP_MULTIPLE, deadline
        );
        evil.setTarget(evilRound);

        evil.mint(alice, 10_000e6);
        vm.prank(alice);
        evil.approve(address(evilRound), type(uint256).max);
        vm.prank(alice);
        evilRound.invest(GOAL);
        evilRound.closeFunding();

        evil.mint(club, 10_000e6);
        vm.prank(club);
        evil.approve(address(evilRound), type(uint256).max);
        vm.prank(club);
        evilRound.distribute(1_000e6);

        assertGt(evilRound.pendingReward(alice), 0);

        evil.setArmed(true);
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        evilRound.claim();
    }

    // -- guards: constructor validation + distribute with no holders ------

    function test_RevertWhen_DistributeWithNoHolders() public {
        // nobody invests; deadline passes; closeFunding is still allowed
        // (totalRaised=0 >= 0 is moot, but block.timestamp >= deadline holds).
        vm.warp(deadline);
        round.closeFunding();
        assertEq(round.totalSupply(), 0);

        _fundClubForRevenue(1_000e6);
        vm.prank(club);
        vm.expectRevert("no holders");
        round.distribute(1_000e6);
    }

    function test_RevertWhen_ConstructorRevenueBpsZero() public {
        vm.expectRevert("revenueBps out of range");
        new RevenueShareRound("X", "X", address(usdt), club, GOAL, SHARE_PRICE, 0, CAP_MULTIPLE, deadline);
    }

    function test_RevertWhen_ConstructorRevenueBpsAboveDenom() public {
        vm.expectRevert("revenueBps out of range");
        new RevenueShareRound("X", "X", address(usdt), club, GOAL, SHARE_PRICE, BPS_DENOM + 1, CAP_MULTIPLE, deadline);
    }

    function test_RevertWhen_ConstructorCapMultipleZero() public {
        vm.expectRevert("capMultiple=0");
        new RevenueShareRound("X", "X", address(usdt), club, GOAL, SHARE_PRICE, REVENUE_BPS, 0, deadline);
    }

    function test_RevertWhen_ConstructorGoalZero() public {
        vm.expectRevert("goal=0");
        new RevenueShareRound("X", "X", address(usdt), club, 0, SHARE_PRICE, REVENUE_BPS, CAP_MULTIPLE, deadline);
    }

    // -- non-unit share price: reward math must be price-independent -------

    /// @dev Two holders invest at a non-1:1 sharePriceUsdt, receive
    /// unequal share counts as a result, then a single distribute/claim
    /// round-trip must still pay out in exact proportion to shares held —
    /// proving the accRewardPerShare path never leaks the price itself into
    /// the reward math (it only ever sees share balances).
    function _runNonUnitPriceScenario(uint256 price) internal {
        RevenueShareRound r =
            new RevenueShareRound("NUP", "NUP", address(usdt), club, 1, price, REVENUE_BPS, CAP_MULTIPLE, deadline);

        vm.prank(alice);
        usdt.approve(address(r), type(uint256).max);
        vm.prank(bob);
        usdt.approve(address(r), type(uint256).max);

        uint256 aliceInvest = 3_000e6;
        uint256 bobInvest = 7_000e6;

        vm.prank(alice);
        r.invest(aliceInvest);
        vm.prank(bob);
        r.invest(bobInvest);

        uint256 aliceShares = (aliceInvest * SHARE_UNIT_FOR_TEST) / price;
        uint256 bobShares = (bobInvest * SHARE_UNIT_FOR_TEST) / price;
        assertEq(r.balanceOf(alice), aliceShares);
        assertEq(r.balanceOf(bob), bobShares);

        r.closeFunding();

        usdt.mint(club, 100_000e6);
        vm.prank(club);
        usdt.approve(address(r), type(uint256).max);

        uint256 revenue = 10_000e6;
        vm.prank(club);
        r.distribute(revenue);

        uint256 credited = (revenue * REVENUE_BPS) / BPS_DENOM;
        uint256 supply = aliceShares + bobShares;
        uint256 acc = (credited * r.ACC_PRECISION()) / supply;

        uint256 aliceExpected = (aliceShares * acc) / r.ACC_PRECISION();
        uint256 bobExpected = (bobShares * acc) / r.ACC_PRECISION();

        assertEq(r.pendingReward(alice), aliceExpected);
        assertEq(r.pendingReward(bob), bobExpected);

        uint256 aliceBalBefore = usdt.balanceOf(alice);
        vm.prank(alice);
        r.claim();
        assertEq(usdt.balanceOf(alice), aliceBalBefore + aliceExpected);

        uint256 bobBalBefore = usdt.balanceOf(bob);
        vm.prank(bob);
        r.claim();
        assertEq(usdt.balanceOf(bob), bobBalBefore + bobExpected);
    }

    // mirrors RevenueShareRound.SHARE_UNIT (1e6); kept local so this test
    // doesn't silently pass if the contract's scaling constant ever changes.
    uint256 constant SHARE_UNIT_FOR_TEST = 1e6;

    function test_NonUnitSharePrice_2xUsdtPerShare() public {
        _runNonUnitPriceScenario(2e6);
    }

    function test_NonUnitSharePrice_HalfUsdtPerShare() public {
        _runNonUnitPriceScenario(5e5);
    }

    // -- solvency invariant across many interleaved operations -------------

    /// @dev The contract must always hold enough USD₮ to cover every
    /// holder's currently-pending reward, no matter how distributes,
    /// claims, and share transfers interleave. Checked after every step;
    /// a violation here would mean some holder's `claim()` could revert
    /// for lack of funds (or, worse, that funds were double-counted).
    function _assertSolvent() internal view {
        uint256 owed = round.pendingReward(alice) + round.pendingReward(bob) + round.pendingReward(carol);
        assertGe(usdt.balanceOf(address(round)), owed, "round must cover all pending rewards");
    }

    function test_SolvencyInvariantAcrossManyDistributesClaimsAndTransfers() public {
        _activate(1_000e6, 2_000e6, 3_000e6); // 6_000e6 raised/supply
        _fundClubForRevenue(1_000_000e6);
        _assertSolvent();

        vm.prank(club);
        round.distribute(137e6); // small, odd-sized distribute stresses rounding
        _assertSolvent();

        vm.prank(alice);
        round.claim();
        _assertSolvent();

        vm.prank(bob);
        bool ok = round.transfer(carol, 500e6); // shares move mid-round
        assertTrue(ok);
        _assertSolvent();

        vm.prank(club);
        round.distribute(733e6);
        _assertSolvent();

        vm.prank(carol);
        round.claim();
        _assertSolvent();

        vm.prank(club);
        round.distribute(50_000e6); // large enough to bump into the cap
        _assertSolvent();

        vm.prank(alice);
        round.claim();
        vm.prank(bob);
        round.claim();
        vm.prank(carol);
        round.claim();
        _assertSolvent();

        // everything claimable has been claimed: only unclaimable rounding
        // dust, if any, should remain — nowhere near a full unit of USD₮.
        assertEq(round.pendingReward(alice), 0);
        assertEq(round.pendingReward(bob), 0);
        assertEq(round.pendingReward(carol), 0);
        assertLt(usdt.balanceOf(address(round)), 1_000, "only negligible rounding dust should remain");
    }
}
