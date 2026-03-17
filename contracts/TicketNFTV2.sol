// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ICheckInRegistry} from "./interfaces/ICheckInRegistry.sol";
import {IERC4494} from "./interfaces/IERC4494.sol";
import {IFanFuelBank} from "./interfaces/IFanFuelBank.sol";
import {IFanScoreRegistry} from "./interfaces/IFanScoreRegistry.sol";
import {IInsurancePool} from "./interfaces/IInsurancePool.sol";

contract TicketNFTV2 is ERC721, AccessControl, EIP712, Pausable, IERC4906, IERC4494 {
    using Strings for uint256;

    enum TicketClass {
        Standard,
        FanPass
    }

    struct CoverageData {
        bool insured;
        bool claimed;
        uint64 claimedRound;
        uint256 premiumPaid;
    }

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)");
    bytes32 public constant FAN_PASS_ATTESTATION_TYPEHASH =
        keccak256("FanPassAttestation(address buyer,uint256 deadline)");
    bytes32 private constant PRIMARY_STANDARD_MINT = keccak256("PRIMARY_STANDARD_MINT");
    bytes32 private constant PRIMARY_FAN_PASS_MINT = keccak256("PRIMARY_FAN_PASS_MINT");

    uint256 public immutable primaryPrice;
    uint256 public immutable insurancePremium;
    uint256 public immutable maxSupply;
    uint256 public immutable fanPassAllocationBps;
    uint256 public immutable fanPassSupplyCap;
    uint256 public immutable artistRoyaltyBps;
    uint256 public constant maxPerWallet = 2;

    uint256 public constant STANDARD_MINT_SCORE_REWARD = 10;
    uint256 public constant FAN_PASS_MINT_SCORE_REWARD = 20;
    uint256 public constant STANDARD_MINT_FUEL_REWARD = 5;
    uint256 public constant FAN_PASS_MINT_FUEL_REWARD = 10;

    address public immutable treasury;
    bytes32 public immutable artistKey;

    string public artistId;
    string public seriesId;
    bool public collectibleMode;
    address public attestationSigner;
    address public marketplace;
    address public insurancePool;
    ICheckInRegistry public checkInRegistry;
    IFanScoreRegistry public fanScoreRegistry;
    IFanFuelBank public fanFuelBank;

    string private _baseTokenURI;
    string private _collectibleBaseURI;
    uint256 private _nextTokenId;
    uint256 private _fanPassMinted;

    mapping(uint256 tokenId => TicketClass) private _ticketClasses;
    mapping(uint256 tokenId => CoverageData) private _coverageData;
    mapping(uint256 tokenId => uint256) private _permitNonces;
    mapping(uint256 tokenId => bool) private _issuedTokens;
    mapping(uint256 tokenId => bool) private _consumedTokens;

    error PermitExpired(uint256 deadline);
    error InvalidPermitSigner(address signer, address owner);
    error AttestationExpired(uint256 deadline);
    error InvalidAttestationSigner(address signer, address expectedSigner);

    event PrimaryMinted(address indexed buyer, uint256 indexed tokenId, uint256 paidAmount);
    event StandardMinted(address indexed buyer, uint256 indexed tokenId, bool insured);
    event FanPassMinted(address indexed buyer, uint256 indexed tokenId, bool insured);
    event MarketplaceUpdated(address indexed previousMarketplace, address indexed newMarketplace);
    event CheckInRegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event InsurancePoolUpdated(address indexed previousPool, address indexed newPool);
    event AttestationSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event RewardsUpdated(address indexed fanScoreRegistry, address indexed fanFuelBank);
    event BaseUriUpdated(string baseTokenURI);
    event CollectibleModeUpdated(bool enabled);
    event BaseUrisUpdated(string baseTokenURI, string collectibleBaseURI);
    event CoveragePurchased(uint256 indexed tokenId, uint256 premiumPaid);
    event CoverageClaimMarked(uint256 indexed tokenId, uint64 indexed roundId);
    event TicketConsumed(uint256 indexed tokenId, address indexed owner, uint8 indexed ticketClass);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory artistId_,
        string memory seriesId_,
        uint256 primaryPrice_,
        uint256 insurancePremium_,
        uint256 maxSupply_,
        uint256 fanPassAllocationBps_,
        uint256 artistRoyaltyBps_,
        address treasury_,
        string memory baseTokenURI_,
        address attestationSigner_,
        address fanScoreRegistry_,
        address fanFuelBank_,
        address initialAdmin_
    ) ERC721(name_, symbol_) EIP712(name_, "2") {
        require(primaryPrice_ > 0, "Primary price must be > 0");
        require(maxSupply_ > 0, "Max supply must be > 0");
        require(treasury_ != address(0), "Treasury is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");
        require(attestationSigner_ != address(0), "Attestation signer is zero address");
        require(fanPassAllocationBps_ <= 10_000, "Invalid FanPass allocation");
        require(artistRoyaltyBps_ <= 10_000, "Invalid artist royalty");

        primaryPrice = primaryPrice_;
        insurancePremium = insurancePremium_;
        maxSupply = maxSupply_;
        fanPassAllocationBps = fanPassAllocationBps_;
        fanPassSupplyCap = (maxSupply_ * fanPassAllocationBps_) / 10_000;
        artistRoyaltyBps = artistRoyaltyBps_;
        treasury = treasury_;
        artistId = artistId_;
        seriesId = seriesId_;
        artistKey = keccak256(bytes(artistId_));
        attestationSigner = attestationSigner_;
        _baseTokenURI = baseTokenURI_;

        fanScoreRegistry = IFanScoreRegistry(fanScoreRegistry_);
        fanFuelBank = IFanFuelBank(fanFuelBank_);

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(PAUSER_ROLE, initialAdmin_);
    }

    function mintPrimary() external payable whenNotPaused returns (uint256 tokenId) {
        tokenId = _mintStandardTicket(msg.sender, false, msg.value);
        emit PrimaryMinted(msg.sender, tokenId, msg.value);
    }

    function standardSupplyCap() public view returns (uint256) {
        return maxSupply - fanPassSupplyCap;
    }

    function fanPassMinted() external view returns (uint256) {
        return _fanPassMinted;
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    function mintStandard(bool insured) external payable whenNotPaused returns (uint256 tokenId) {
        tokenId = _mintStandardTicket(msg.sender, insured, msg.value);
        emit StandardMinted(msg.sender, tokenId, insured);
    }

    function mintFanPass(
        bytes calldata attestation,
        bool insured,
        uint256 deadline
    ) external payable whenNotPaused returns (uint256 tokenId) {
        require(_nextTokenId < maxSupply, "Event sold out");
        require(_fanPassMinted < fanPassSupplyCap, "FanPass allocation exhausted");
        require(balanceOf(msg.sender) < maxPerWallet, "Wallet ticket limit reached");
        _verifyFanPassAttestation(msg.sender, deadline, attestation);

        uint256 requiredPayment = primaryPrice + (insured ? insurancePremium : 0);
        require(msg.value == requiredPayment, "Incorrect payment amount");

        _fanPassMinted += 1;
        tokenId = _mintTicket(msg.sender, TicketClass.FanPass, insured);
        _payoutPrimary(primaryPrice);

        emit FanPassMinted(msg.sender, tokenId, insured);
    }

    function setMarketplace(address newMarketplace) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMarketplace != address(0), "Marketplace is zero address");
        address previousMarketplace = marketplace;
        marketplace = newMarketplace;
        emit MarketplaceUpdated(previousMarketplace, newMarketplace);
    }

    function setCheckInRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRegistry != address(0), "Registry is zero address");
        address previousRegistry = address(checkInRegistry);
        checkInRegistry = ICheckInRegistry(newRegistry);
        emit CheckInRegistryUpdated(previousRegistry, newRegistry);
    }

    function setInsurancePool(address newInsurancePool) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newInsurancePool != address(0), "Insurance pool is zero address");
        address previousPool = insurancePool;
        insurancePool = newInsurancePool;
        emit InsurancePoolUpdated(previousPool, newInsurancePool);
    }

    function setAttestationSigner(address newAttestationSigner) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAttestationSigner != address(0), "Attestation signer is zero address");
        address previousSigner = attestationSigner;
        attestationSigner = newAttestationSigner;
        emit AttestationSignerUpdated(previousSigner, newAttestationSigner);
    }

    function setRewardContracts(
        address newFanScoreRegistry,
        address newFanFuelBank
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        fanScoreRegistry = IFanScoreRegistry(newFanScoreRegistry);
        fanFuelBank = IFanFuelBank(newFanFuelBank);
        emit RewardsUpdated(newFanScoreRegistry, newFanFuelBank);
    }

    function setBaseUri(string calldata baseTokenURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseTokenURI_;
        emit BaseUriUpdated(baseTokenURI_);
        emit BaseUrisUpdated(baseTokenURI_, _collectibleBaseURI);

        _emitBatchMetadataUpdate();
    }

    function setCollectibleMode(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        collectibleMode = enabled;
        emit CollectibleModeUpdated(enabled);
        _emitBatchMetadataUpdate();
    }

    function setBaseUris(
        string calldata baseTokenURI_,
        string calldata collectibleBaseURI_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseTokenURI_;
        _collectibleBaseURI = collectibleBaseURI_;
        emit BaseUriUpdated(baseTokenURI_);
        emit BaseUrisUpdated(baseTokenURI_, collectibleBaseURI_);
        _emitBatchMetadataUpdate();
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function nonces(uint256 tokenId) external view returns (uint256) {
        return _permitNonces[tokenId];
    }

    function baseUris()
        external
        view
        returns (string memory baseTokenURI, string memory collectibleBaseURI)
    {
        return (_baseTokenURI, _collectibleBaseURI);
    }

    function isUsed(uint256 tokenId) public view returns (bool) {
        return _consumedTokens[tokenId] || _isMarkedUsed(tokenId);
    }

    function ticketClassOf(uint256 tokenId) public view returns (uint8) {
        require(_issuedTokens[tokenId], "Unknown ticket");
        return uint8(_ticketClasses[tokenId]);
    }

    function coverageClaimed(uint256 tokenId) external view returns (bool) {
        require(_issuedTokens[tokenId], "Unknown ticket");
        return _coverageData[tokenId].claimed;
    }

    function coverageOf(
        uint256 tokenId
    )
        external
        view
        returns (
            bool insured,
            bool claimed,
            bool claimable,
            uint16 payoutBps,
            uint64 weatherRoundId,
            uint256 premiumPaid,
            uint256 payoutAmount
        )
    {
        require(_issuedTokens[tokenId], "Unknown ticket");
        CoverageData memory coverage = _coverageData[tokenId];
        insured = coverage.insured;
        claimed = coverage.claimed;
        premiumPaid = coverage.premiumPaid;

        if (!coverage.insured || insurancePool == address(0)) {
            return (insured, claimed, false, 0, coverage.claimedRound, premiumPaid, 0);
        }

        try IInsurancePool(insurancePool).currentPolicy() returns (
            bool active,
            uint16 currentPayoutBps,
            uint64 roundId,
            bytes32
        ) {
            payoutBps = currentPayoutBps;
            weatherRoundId = roundId;
            claimable = active && !coverage.claimed && currentPayoutBps > 0;
            payoutAmount = claimable ? (primaryPrice * currentPayoutBps) / 10_000 : 0;
            return (
                insured,
                claimed,
                claimable,
                payoutBps,
                weatherRoundId,
                premiumPaid,
                payoutAmount
            );
        } catch {
            return (insured, claimed, false, 0, coverage.claimedRound, premiumPaid, 0);
        }
    }

    function markCoverageClaimed(
        uint256 tokenId,
        uint64 roundId
    ) external {
        require(msg.sender == insurancePool, "Only insurance pool can mark claims");
        require(_issuedTokens[tokenId], "Unknown ticket");

        CoverageData storage coverage = _coverageData[tokenId];
        require(coverage.insured, "Coverage not enabled");
        require(!coverage.claimed, "Coverage already claimed");

        coverage.claimed = true;
        coverage.claimedRound = roundId;
        emit CoverageClaimMarked(tokenId, roundId);
    }

    function consumeForCheckIn(
        uint256 tokenId
    ) external returns (address owner, uint8 ticketClass) {
        require(msg.sender == address(checkInRegistry), "Only check-in registry can consume");
        require(!_consumedTokens[tokenId], "Ticket already used");

        owner = ownerOf(tokenId);
        ticketClass = uint8(_ticketClasses[tokenId]);
        _consumedTokens[tokenId] = true;
        _burn(tokenId);

        emit TicketConsumed(tokenId, owner, ticketClass);
    }

    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) {
            revert PermitExpired(deadline);
        }

        address owner = ownerOf(tokenId);
        uint256 currentNonce = _permitNonces[tokenId];
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, spender, tokenId, currentNonce, deadline)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedDataV4(structHash), signature);
        if (signer != owner) {
            revert InvalidPermitSigner(signer, owner);
        }

        unchecked {
            _permitNonces[tokenId] = currentNonce + 1;
        }
        _approve(spender, tokenId, address(0));
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        if (bytes(_baseTokenURI).length == 0) {
            return "";
        }

        return
            string.concat(
                _baseTokenURI,
                _ticketClasses[tokenId] == TicketClass.FanPass ? "fanpass/" : "standard/",
                tokenId.toString(),
                ".json"
            );
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl, IERC165) returns (bool) {
        return
            interfaceId == type(IERC4906).interfaceId ||
            interfaceId == type(IERC4494).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address from) {
        from = _ownerOf(tokenId);

        if (from == address(0) && to != address(0)) {
            require(balanceOf(to) < maxPerWallet, "Wallet ticket limit reached");
        } else if (from != address(0) && to != address(0)) {
            require(msg.sender == marketplace, "Transfers only through marketplace");
            require(!isUsed(tokenId), "Used tickets are non-transferable");
            require(balanceOf(to) < maxPerWallet, "Wallet ticket limit reached");

            if (_ticketClasses[tokenId] == TicketClass.FanPass) {
                require(to == treasury, "FanPass transfers only to organizer");
            }
        } else if (from != address(0) && to == address(0)) {
            require(msg.sender == address(checkInRegistry), "Burn only through check-in registry");
        }

        address previousOwner = super._update(to, tokenId, auth);
        if (previousOwner != address(0) && previousOwner != to) {
            unchecked {
                _permitNonces[tokenId] += 1;
            }
        }

        return previousOwner;
    }

    function _mintTicket(
        address buyer,
        TicketClass ticketClass,
        bool insured
    ) private returns (uint256 tokenId) {
        tokenId = _nextTokenId;
        _nextTokenId += 1;

        _issuedTokens[tokenId] = true;
        _ticketClasses[tokenId] = ticketClass;
        _safeMint(buyer, tokenId);

        if (insured) {
            require(insurancePool != address(0), "Insurance pool not configured");
            _coverageData[tokenId] = CoverageData({
                insured: true,
                claimed: false,
                claimedRound: 0,
                premiumPaid: insurancePremium
            });
            IInsurancePool(insurancePool).registerCoverage{value: insurancePremium}(tokenId);
            emit CoveragePurchased(tokenId, insurancePremium);
        }

        _rewardMint(buyer, ticketClass);
    }

    function _rewardMint(address buyer, TicketClass ticketClass) private {
        uint256 scoreReward = ticketClass == TicketClass.FanPass
            ? FAN_PASS_MINT_SCORE_REWARD
            : STANDARD_MINT_SCORE_REWARD;
        uint256 fuelReward = ticketClass == TicketClass.FanPass
            ? FAN_PASS_MINT_FUEL_REWARD
            : STANDARD_MINT_FUEL_REWARD;

        if (address(fanScoreRegistry) != address(0)) {
            fanScoreRegistry.recordMint(buyer, artistKey, scoreReward);
        }

        if (address(fanFuelBank) != address(0)) {
            fanFuelBank.reward(
                buyer,
                fuelReward,
                ticketClass == TicketClass.FanPass ? PRIMARY_FAN_PASS_MINT : PRIMARY_STANDARD_MINT
            );
        }
    }

    function _payoutPrimary(uint256 primaryAmount) private {
        (bool paid, ) = payable(treasury).call{value: primaryAmount}("");
        require(paid, "Primary payout failed");
    }

    function _mintStandardTicket(
        address buyer,
        bool insured,
        uint256 paymentAmount
    ) private returns (uint256 tokenId) {
        require(_nextTokenId < maxSupply, "Event sold out");
        require(_standardMinted() < standardSupplyCap(), "Standard allocation exhausted");
        require(balanceOf(buyer) < maxPerWallet, "Wallet ticket limit reached");

        uint256 requiredPayment = primaryPrice + (insured ? insurancePremium : 0);
        require(paymentAmount == requiredPayment, "Incorrect payment amount");

        tokenId = _mintTicket(buyer, TicketClass.Standard, insured);
        _payoutPrimary(primaryPrice);
    }

    function _standardMinted() private view returns (uint256) {
        return _nextTokenId - _fanPassMinted;
    }

    function _verifyFanPassAttestation(
        address buyer,
        uint256 deadline,
        bytes calldata signature
    ) private view {
        if (block.timestamp > deadline) {
            revert AttestationExpired(deadline);
        }

        bytes32 structHash = keccak256(
            abi.encode(FAN_PASS_ATTESTATION_TYPEHASH, buyer, deadline)
        );
        address signer = ECDSA.recoverCalldata(_hashTypedDataV4(structHash), signature);
        if (signer != attestationSigner) {
            revert InvalidAttestationSigner(signer, attestationSigner);
        }
    }

    function _isMarkedUsed(uint256 tokenId) private view returns (bool) {
        if (address(checkInRegistry) == address(0)) {
            return false;
        }

        return checkInRegistry.isUsed(tokenId);
    }

    function _emitBatchMetadataUpdate() private {
        if (_nextTokenId == 0) {
            return;
        }

        emit BatchMetadataUpdate(0, _nextTokenId - 1);
    }
}
