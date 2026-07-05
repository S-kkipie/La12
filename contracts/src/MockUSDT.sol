// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDT
/// @notice Testnet/local stand-in for Tether USD (USD₮). Mirrors real USDT's
/// 6-decimal base unit so amounts line up with mainnet/Sepolia USD₮ math.
/// `mint` is intentionally unrestricted — this is a faucet token for the
/// hackathon demo only, never meant to hold real value.
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock Tether USD", "USDT") {}

    /// @notice USD₮ uses 6 decimals, not the ERC20 default of 18.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint test USD₮ to any address. No access control by design —
    /// this is a faucet for local/testnet funding, not a production token.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
