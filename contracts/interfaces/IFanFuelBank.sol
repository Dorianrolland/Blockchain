// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFanFuelBank {
    function balanceOf(address fan) external view returns (uint256);

    function reward(address fan, uint256 amount, bytes32 reason) external;

    function spendFrom(address fan, uint256 amount, bytes32 reason) external;
}
