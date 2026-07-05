// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {RevenueShareRound} from "../../src/RevenueShareRound.sol";

/// @title MaliciousUSDT
/// @notice Test-only ERC20 whose `transfer` calls back into a target round's
/// `claim()` before completing, standing in for a compromised/hostile token
/// so we can prove `ReentrancyGuard` actually stops a reentrant claim. Real
/// USDT has no such callback, but the guard must hold regardless of which
/// ERC20 is configured as `usdt`.
contract MaliciousUSDT is ERC20 {
    RevenueShareRound public target;
    bool public armed;

    constructor() ERC20("Evil USD", "EVIL") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTarget(RevenueShareRound _target) external {
        target = _target;
    }

    function setArmed(bool _armed) external {
        armed = _armed;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (armed) {
            armed = false; // disarm so the reentrant attempt itself doesn't loop forever
            target.claim(); // expected to revert with ReentrancyGuardReentrantCall
        }
        return super.transfer(to, amount);
    }
}
