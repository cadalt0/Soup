// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AvaxSepoliaTransferWalletFactory
 * @notice Factory to create wallets that can only transfer USDC to a designated destination on Avalanche Fuji.
 * @dev Public creation; destination can be updated only by the current destination address.
 */
contract AvaxSepoliaTransferWalletFactory is Ownable {
    using SafeERC20 for IERC20;

    // Avalanche Fuji USDC
    address public constant USDC = 0x5425890298aed601595a70AB815c96711a31Bc65;
    
    // Fixed fee address (1% goes here)
    address public constant FEE_ADDRESS = 0xd5A3259cc15C588EdAF23FaFB9620910580189f4;

    // Wallet tracking
    mapping(address => bool) public isDeployedWallet;
    address[] public deployedWallets;

    // Events
    event WalletCreated(address indexed wallet, address indexed destination);

    constructor() Ownable(msg.sender) {}

    function _createWallet(address destination) internal returns (address walletAddress) {
        require(destination != address(0), "Invalid destination");

        TransferOnlyWallet wallet = new TransferOnlyWallet(destination, address(this));
        walletAddress = address(wallet);

        isDeployedWallet[walletAddress] = true;
        deployedWallets.push(walletAddress);

        emit WalletCreated(walletAddress, destination);
        return walletAddress;
    }

    /**
     * @notice Create a single transfer-only wallet
     * @param destination Initial destination that receives USDC from this wallet
     */
    function createSingleWallet(address destination) external returns (address walletAddress) {
        return _createWallet(destination);
    }

    /**
     * @notice Batch create transfer-only wallets
     * @param destinations List of initial destinations
     */
    function createMultipleWallets(address[] calldata destinations) external returns (address[] memory walletAddresses) {
        require(destinations.length > 0, "Empty destinations");
        walletAddresses = new address[](destinations.length);
        for (uint256 i = 0; i < destinations.length; i++) {
            walletAddresses[i] = _createWallet(destinations[i]);
        }
        return walletAddresses;
    }

    // Views
    function getAllDeployedWallets() external view returns (address[] memory) {
        return deployedWallets;
    }

    function getWalletCount() external view returns (uint256) {
        return deployedWallets.length;
    }

    function isWallet(address wallet) external view returns (bool) {
        return isDeployedWallet[wallet];
    }

    // Emergency admin functions
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH withdrawal failed");
    }

    function withdrawERC20(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        IERC20(token).safeTransfer(owner(), balance);
    }
}

/**
 * @title TransferOnlyWallet
 * @notice Wallet that can only transfer USDC to a designated destination on Avalanche Fuji.
 * @dev Destination can be updated only by the current destination address.
 */
contract TransferOnlyWallet {
    using SafeERC20 for IERC20;

    // Factory reference
    address public immutable factory;

    // Token
    address public constant USDC = 0x5425890298aed601595a70AB815c96711a31Bc65;
    
    // Fixed fee address (1% goes here)
    address public constant FEE_ADDRESS = 0xd5A3259cc15C588EdAF23FaFB9620910580189f4;

    // Destination that receives USDC
    address public destination;

    // Events
    event DestinationChanged(address indexed oldDestination, address indexed newDestination);
    event USDCTransferred(address indexed to, uint256 amount);
    event USDCTransferredWithFee(address indexed to, uint256 amount, address indexed feeAddress, uint256 feeAmount);

    modifier onlyFactory() {
        require(msg.sender == factory, "Only factory can call");
        _;
    }

    modifier onlyDestination() {
        require(msg.sender == destination, "Only destination can call");
        _;
    }

    constructor(address initialDestination, address _factory) {
        require(initialDestination != address(0), "Invalid destination");
        destination = initialDestination;
        factory = _factory;
    }
    
    /**
     * @notice Calculate fee split (1% to fee address, 99% to destination)
     * @param amount Total amount to split
     * @return feeAmount Amount going to fee address (1%)
     * @return destinationAmount Amount going to destination (99%)
     */
    function calculateFeeSplit(uint256 amount) public pure returns (uint256 feeAmount, uint256 destinationAmount) {
        feeAmount = amount / 100; // 1%
        destinationAmount = amount - feeAmount; // 99%
    }

    /**
     * @notice Transfer specific amount of USDC with 1% fee split
     */
    function transferUSDC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(USDC).balanceOf(address(this)) >= amount, "Insufficient USDC balance");
        
        (uint256 feeAmount, uint256 destinationAmount) = calculateFeeSplit(amount);
        
        // Transfer 1% to fee address
        if (feeAmount > 0) {
            IERC20(USDC).safeTransfer(FEE_ADDRESS, feeAmount);
        }
        
        // Transfer 99% to destination
        if (destinationAmount > 0) {
            IERC20(USDC).safeTransfer(destination, destinationAmount);
        }
        
        emit USDCTransferredWithFee(destination, destinationAmount, FEE_ADDRESS, feeAmount);
    }

    /**
     * @notice Transfer all USDC balance with 1% fee split
     */
    function transferAllUSDC() external {
        uint256 balance = IERC20(USDC).balanceOf(address(this));
        require(balance > 0, "No USDC to transfer");
        
        (uint256 feeAmount, uint256 destinationAmount) = calculateFeeSplit(balance);
        
        // Transfer 1% to fee address
        if (feeAmount > 0) {
            IERC20(USDC).safeTransfer(FEE_ADDRESS, feeAmount);
        }
        
        // Transfer 99% to destination
        if (destinationAmount > 0) {
            IERC20(USDC).safeTransfer(destination, destinationAmount);
        }
        
        emit USDCTransferredWithFee(destination, destinationAmount, FEE_ADDRESS, feeAmount);
    }

    /**
     * @notice Change destination. Only current destination can change it.
     */
    function setDestination(address newDestination) external onlyDestination {
        require(newDestination != address(0), "Invalid destination");
        address old = destination;
        destination = newDestination;
        emit DestinationChanged(old, newDestination);
    }

    /**
     * @notice View helpers
     */
    function getConfig() external view returns (address destinationAddr, address factoryAddr) {
        return (destination, factory);
    }
}

