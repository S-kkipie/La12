// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RevenueShareRound} from "./RevenueShareRound.sol";

/// @title RoundFactory
/// @notice Deploys `RevenueShareRound` instances and keeps a simple on-chain
/// registry so the frontend's `/api/sync` can discover rounds by watching
/// `RoundCreated`. Permissionless by design (any club can spin up its own
/// round) — access control for "who may claim to be a given club" lives
/// off-chain in the demo, not in this contract.
contract RoundFactory {
    address[] public allRounds;
    mapping(address => address[]) private _roundsByClub;

    event RoundCreated(
        address indexed round,
        address indexed club,
        address indexed usdtToken,
        uint256 goal,
        uint256 sharePriceUsdt,
        uint256 revenueBps,
        uint256 capMultiple,
        uint256 deadline
    );

    /// @notice Deploy a new revenue-share round for a club.
    function createRound(
        string calldata name_,
        string calldata symbol_,
        address usdtToken,
        address club,
        uint256 goal,
        uint256 sharePriceUsdt,
        uint256 revenueBps,
        uint256 capMultiple,
        uint256 deadline
    ) external returns (address round) {
        RevenueShareRound r = new RevenueShareRound(
            name_, symbol_, usdtToken, club, goal, sharePriceUsdt, revenueBps, capMultiple, deadline
        );
        round = address(r);

        allRounds.push(round);
        _roundsByClub[club].push(round);

        emit RoundCreated(round, club, usdtToken, goal, sharePriceUsdt, revenueBps, capMultiple, deadline);
    }

    /// @notice All rounds ever created, across all clubs.
    function rounds() external view returns (address[] memory) {
        return allRounds;
    }

    /// @notice Rounds created for a specific club's payout wallet.
    function roundsByClub(address club) external view returns (address[] memory) {
        return _roundsByClub[club];
    }

    function roundsCount() external view returns (uint256) {
        return allRounds.length;
    }
}
