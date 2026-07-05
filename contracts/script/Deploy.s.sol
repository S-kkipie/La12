// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDT} from "../src/MockUSDT.sol";
import {RoundFactory} from "../src/RoundFactory.sol";

/// @notice Deploys MockUSDT + RoundFactory, then opens one demo funding
/// round for the fictional club "Deportivo San Martín" — so a judge starts
/// the demo with zero on-chain setup of their own.
///
/// Local (anvil):
///   anvil                                    # separate terminal
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///   # no env needed: falls back to anvil's well-known account #0 dev key.
///
/// Sepolia:
///   DEPLOYER_PK=0x... CLUB_ADDRESS=0x... \
///     forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///
/// @dev The deploy key is read from DEPLOYER_PK (env) rather than the CLI's
/// --private-key flag, so we can derive a sensible default `club` address
/// (the deployer itself) for free via vm.addr — set DEPLOYER_PK, not
/// --private-key, to choose who signs.
///
/// Env overrides (all optional):
///   DEPLOYER_PK         - deploy/broadcast key (default: anvil account #0, LOCAL ONLY)
///   CLUB_ADDRESS        - club payout wallet (default: the deployer's own address)
///   ROUND_GOAL          - funding goal, USD₮ base units, 6 decimals (default 40_000e6)
///   SHARE_PRICE_USDT    - USD₮ per whole share, 6 decimals (default 1e6 -> 1:1)
///   REVENUE_BPS         - holder cut in bps (default 800 = 8%)
///   CAP_MULTIPLE        - reward cap, bps-scaled, e.g. 15_000 = 1.5x (default 15_000)
///   ROUND_DEADLINE_DAYS - days from now until the funding deadline (default 90)
contract Deploy is Script {
    // Anvil's account #0. Public, well-known, and only ever holds funds on a
    // local chain — safe as a "just works out of the box" local default.
    uint256 internal constant ANVIL_DEFAULT_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external returns (MockUSDT usdt, RoundFactory factory, address round) {
        uint256 deployerPk = vm.envOr("DEPLOYER_PK", ANVIL_DEFAULT_PK);
        address deployer = vm.addr(deployerPk);
        address club = vm.envOr("CLUB_ADDRESS", deployer);

        uint256 goal = vm.envOr("ROUND_GOAL", uint256(40_000e6));
        uint256 sharePriceUsdt = vm.envOr("SHARE_PRICE_USDT", uint256(1e6));
        uint256 revenueBps = vm.envOr("REVENUE_BPS", uint256(800));
        uint256 capMultiple = vm.envOr("CAP_MULTIPLE", uint256(15_000));
        uint256 deadlineDays = vm.envOr("ROUND_DEADLINE_DAYS", uint256(90));
        uint256 deadline = block.timestamp + deadlineDays * 1 days;

        vm.startBroadcast(deployerPk);

        usdt = new MockUSDT();
        factory = new RoundFactory();

        round = factory.createRound(
            "Deportivo San Martin Round 1",
            "DSM-R1",
            address(usdt),
            club,
            goal,
            sharePriceUsdt,
            revenueBps,
            capMultiple,
            deadline
        );

        vm.stopBroadcast();

        console2.log("Deployer      :", deployer);
        console2.log("Club wallet   :", club);
        console2.log("MockUSDT      :", address(usdt));
        console2.log("RoundFactory  :", address(factory));
        console2.log("Demo round    :", round);
        console2.log("Goal (USDT)   :", goal);
        console2.log("Deadline (ts) :", deadline);
    }
}
