// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ICollectibleNFT {
    function mintCollectible(
        address to,
        address originFan,
        uint256 sourceTicketId,
        uint8 sourceTicketClass
    ) external returns (uint256 collectibleId);
}
