// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @dev Minimal ERC-20 stand-in whose transferFrom always returns false.
/// SafeERC20 wraps transferFrom and reverts when it returns false.
contract FalseReturnERC20 {
    // Minimal ERC-20 surface — only the methods CarpanInvoice touches.
    string public name = "FalseReturn";
    string public symbol = "FR";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function totalSupply() external pure returns (uint256) { return 0; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    /// @dev Always returns false — SafeERC20 should revert on this.
    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}
