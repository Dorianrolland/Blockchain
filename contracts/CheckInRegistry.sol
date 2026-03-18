// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {ITicketSystemState} from "./interfaces/ITicketSystemState.sol";

contract CheckInRegistry is AccessControl, EIP712 {
    bytes32 public constant SCANNER_ADMIN_ROLE = keccak256("SCANNER_ADMIN_ROLE");
    bytes32 public constant SCANNER_ROLE = keccak256("SCANNER_ROLE");
    
    bytes32 public constant CHECK_IN_TYPEHASH = keccak256("CheckInPermit(uint256 tokenId,uint256 nonce,uint256 deadline)");

    ITicketSystemState public immutable ticketNFT;

    mapping(uint256 => bool) private _usedTickets;
    mapping(uint256 => uint256) public nonces;

    event ScannerGranted(address indexed account);
    event ScannerRevoked(address indexed account);
    event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner);

    constructor(address ticketNFT_, address initialAdmin_) EIP712("ChainTicket", "1") {
        require(ticketNFT_ != address(0), "TicketNFT is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");
        ticketNFT = ITicketSystemState(ticketNFT_);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(SCANNER_ADMIN_ROLE, initialAdmin_);
        _setRoleAdmin(SCANNER_ROLE, SCANNER_ADMIN_ROLE);
    }

    function grantScanner(address account) external onlyRole(SCANNER_ADMIN_ROLE) {
        require(account != address(0), "Scanner is zero address");
        _grantRole(SCANNER_ROLE, account);
        emit ScannerGranted(account);
    }

    function revokeScanner(address account) external onlyRole(SCANNER_ADMIN_ROLE) {
        _revokeRole(SCANNER_ROLE, account);
        emit ScannerRevoked(account);
    }

    function markUsed(uint256 tokenId) external onlyRole(SCANNER_ROLE) {
        require(!ticketNFT.paused(), "System is paused");
        ticketNFT.ownerOf(tokenId);
        require(!_usedTickets[tokenId], "Ticket already used");

        _usedTickets[tokenId] = true;
        emit TicketMarkedUsed(tokenId, msg.sender);
    }

    function checkInWithPermit(uint256 tokenId, uint256 deadline, bytes calldata signature) external onlyRole(SCANNER_ROLE) {
        require(!ticketNFT.paused(), "System is paused");
        require(block.timestamp <= deadline, "CheckInRegistry: Permit expired");
        require(!_usedTickets[tokenId], "Ticket already used");

        uint256 currentNonce = nonces[tokenId];
        bytes32 structHash = keccak256(abi.encode(CHECK_IN_TYPEHASH, tokenId, currentNonce, deadline));
        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSA.recover(hash, signature);
        address owner = ticketNFT.ownerOf(tokenId);
        require(signer == owner, "CheckInRegistry: Invalid signature or not owner");

        nonces[tokenId]++;
        _usedTickets[tokenId] = true;
        emit TicketMarkedUsed(tokenId, msg.sender);
    }

    function isUsed(uint256 tokenId) external view returns (bool) {
        return _usedTickets[tokenId];
    }
}
