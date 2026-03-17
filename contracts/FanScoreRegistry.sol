// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IFanScoreRegistry} from "./interfaces/IFanScoreRegistry.sol";

contract FanScoreRegistry is AccessControl, IFanScoreRegistry {
    bytes32 public constant SOURCE_ROLE = keccak256("SOURCE_ROLE");

    uint256 public constant SILVER_THRESHOLD = 100;
    uint256 public constant GOLD_THRESHOLD = 250;
    uint256 public constant PLATINUM_THRESHOLD = 500;

    mapping(address fan => uint256) private _reputation;
    mapping(address fan => mapping(bytes32 artistKey => uint256)) private _artistAttendances;

    event ScoreAwarded(
        address indexed fan,
        bytes32 indexed artistKey,
        uint256 amount,
        bytes32 indexed reason,
        uint256 newScore
    );
    event ArtistAttendanceRecorded(
        address indexed fan,
        bytes32 indexed artistKey,
        uint256 newAttendanceCount
    );

    constructor(address initialAdmin_) {
        require(initialAdmin_ != address(0), "Admin is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
    }

    function reputationOf(address fan) external view returns (uint256) {
        return _reputation[fan];
    }

    function artistAttendanceOf(address fan, bytes32 artistKey) external view returns (uint256) {
        return _artistAttendances[fan][artistKey];
    }

    function tierOf(address fan) external view returns (uint8) {
        uint256 score = _reputation[fan];
        if (score >= PLATINUM_THRESHOLD) {
            return 3;
        }
        if (score >= GOLD_THRESHOLD) {
            return 2;
        }
        if (score >= SILVER_THRESHOLD) {
            return 1;
        }
        return 0;
    }

    function recordMint(
        address fan,
        bytes32 artistKey,
        uint256 scoreAmount
    ) external onlyRole(SOURCE_ROLE) {
        _reward(fan, artistKey, scoreAmount, false, keccak256("MINT"));
    }

    function recordPurchase(
        address fan,
        bytes32 artistKey,
        uint256 scoreAmount
    ) external onlyRole(SOURCE_ROLE) {
        _reward(fan, artistKey, scoreAmount, false, keccak256("PURCHASE"));
    }

    function recordBuyback(
        address fan,
        bytes32 artistKey,
        uint256 scoreAmount
    ) external onlyRole(SOURCE_ROLE) {
        _reward(fan, artistKey, scoreAmount, false, keccak256("BUYBACK"));
    }

    function recordAttendance(
        address fan,
        bytes32 artistKey,
        uint256 scoreAmount
    ) external onlyRole(SOURCE_ROLE) {
        _reward(fan, artistKey, scoreAmount, true, keccak256("ATTENDANCE"));
    }

    function _reward(
        address fan,
        bytes32 artistKey,
        uint256 scoreAmount,
        bool incrementAttendance,
        bytes32 reason
    ) private {
        require(fan != address(0), "Fan is zero address");
        if (scoreAmount > 0) {
            _reputation[fan] += scoreAmount;
        }

        emit ScoreAwarded(fan, artistKey, scoreAmount, reason, _reputation[fan]);

        if (incrementAttendance) {
            uint256 newAttendanceCount = _artistAttendances[fan][artistKey] + 1;
            _artistAttendances[fan][artistKey] = newAttendanceCount;
            emit ArtistAttendanceRecorded(fan, artistKey, newAttendanceCount);
        }
    }
}
