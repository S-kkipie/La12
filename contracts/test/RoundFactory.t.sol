// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {RevenueShareRound} from "../src/RevenueShareRound.sol";
import {RoundFactory} from "../src/RoundFactory.sol";

contract RoundFactoryTest is Test {
    RoundFactory factory;
    MockUSDT usdt;

    address club = makeAddr("club");
    uint256 deadline;

    function setUp() public {
        usdt = new MockUSDT();
        factory = new RoundFactory();
        deadline = block.timestamp + 90 days;
    }

    function test_CreateRoundDeploysAndRegisters() public {
        address round = factory.createRound(
            "Deportivo San Martin Round 1", "DSM-R1", address(usdt), club, 40_000e6, 1e6, 800, 15_000, deadline
        );

        assertTrue(round != address(0));

        address[] memory all = factory.rounds();
        assertEq(all.length, 1);
        assertEq(all[0], round);

        address[] memory clubRounds = factory.roundsByClub(club);
        assertEq(clubRounds.length, 1);
        assertEq(clubRounds[0], round);
        assertEq(factory.roundsCount(), 1);

        // the deployed round is wired up with the exact params we passed in.
        RevenueShareRound r = RevenueShareRound(round);
        assertEq(address(r.usdt()), address(usdt));
        assertEq(r.club(), club);
        assertEq(r.goal(), 40_000e6);
        assertEq(r.sharePriceUsdt(), 1e6);
        assertEq(r.revenueBps(), 800);
        assertEq(r.capMultiple(), 15_000);
        assertEq(r.deadline(), deadline);
        assertEq(r.owner(), club);
    }

    function test_CreateRoundEmitsRoundCreated() public {
        vm.recordLogs();
        address round = factory.createRound(
            "Deportivo San Martin Round 1", "DSM-R1", address(usdt), club, 40_000e6, 1e6, 800, 15_000, deadline
        );

        Vm.Log[] memory entries = vm.getRecordedLogs();
        bytes32 sig = keccak256("RoundCreated(address,address,address,uint256,uint256,uint256,uint256,uint256)");

        bool found;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == sig) {
                found = true;
                assertEq(address(uint160(uint256(entries[i].topics[1]))), round);
                assertEq(address(uint160(uint256(entries[i].topics[2]))), club);
                assertEq(address(uint160(uint256(entries[i].topics[3]))), address(usdt));

                (uint256 goal_, uint256 sharePrice_, uint256 revenueBps_, uint256 capMultiple_, uint256 deadline_) =
                    abi.decode(entries[i].data, (uint256, uint256, uint256, uint256, uint256));
                assertEq(goal_, 40_000e6);
                assertEq(sharePrice_, 1e6);
                assertEq(revenueBps_, 800);
                assertEq(capMultiple_, 15_000);
                assertEq(deadline_, deadline);
            }
        }
        assertTrue(found, "RoundCreated event not emitted");
    }

    function test_MultipleRoundsAcrossClubs() public {
        address clubB = makeAddr("clubB");

        address r1 = factory.createRound("A", "A", address(usdt), club, 1_000e6, 1e6, 800, 15_000, deadline);
        address r2 = factory.createRound("B", "B", address(usdt), clubB, 2_000e6, 1e6, 500, 20_000, deadline);
        address r3 = factory.createRound("C", "C", address(usdt), club, 3_000e6, 1e6, 800, 15_000, deadline);

        assertEq(factory.roundsCount(), 3);
        assertEq(factory.rounds().length, 3);

        address[] memory clubRounds = factory.roundsByClub(club);
        assertEq(clubRounds.length, 2);
        assertEq(clubRounds[0], r1);
        assertEq(clubRounds[1], r3);

        address[] memory clubBRounds = factory.roundsByClub(clubB);
        assertEq(clubBRounds.length, 1);
        assertEq(clubBRounds[0], r2);
    }
}
