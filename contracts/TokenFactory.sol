// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenFactory is Ownable {
    struct TokenRequest {
        string name;
        string symbol;
        address creator;
        uint256 approvals;
        bool approved;
        bool exists;
    }

    address[] public admins;
    uint256 public approvalThreshold;
    mapping(address => bool) public isAdmin;
    mapping(bytes32 => TokenRequest) public tokenRequests;
    mapping(bytes32 => mapping(address => bool)) public approvals;

    event TokenRequested(
        bytes32 indexed requestId,
        address indexed creator,
        string name,
        string symbol
    );
    event TokenApproved(bytes32 indexed requestId, address indexed admin);
    event TokenRejected(bytes32 indexed requestId);
    event TokenIssued(bytes32 indexed requestId, address tokenAddress);
    event ApprovalThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Not an admin");
        _;
    }

    constructor(address[] memory _admins, uint256 _approvalThreshold) Ownable() {
        require(_admins.length > 0, "Admins required");
        require(_approvalThreshold > 0 && _approvalThreshold <= _admins.length, "Invalid threshold");

        for (uint256 i = 0; i < _admins.length; i++) {
            require(_admins[i] != address(0), "Invalid admin address");
            isAdmin[_admins[i]] = true;
        }

        admins = _admins;
        approvalThreshold = _approvalThreshold;
    }

    function requestToken(
        string memory name,
        string memory symbol
    ) external returns (bytes32) {
        bytes32 requestId = keccak256(abi.encodePacked(name, symbol, msg.sender, block.timestamp));
        require(!tokenRequests[requestId].exists, "Request already exists");

        tokenRequests[requestId] = TokenRequest({
            name: name,
            symbol: symbol,
            creator: msg.sender,
            approvals: 0,
            approved: false,
            exists: true
        });

        emit TokenRequested(requestId, msg.sender, name, symbol);
        return requestId;
    }

    function approveToken(bytes32 requestId) external onlyAdmin {
        require(tokenRequests[requestId].exists, "Request does not exist");
        require(!approvals[requestId][msg.sender], "Already approved");
        require(!tokenRequests[requestId].approved, "Already approved by threshold");

        approvals[requestId][msg.sender] = true;
        tokenRequests[requestId].approvals++;

        emit TokenApproved(requestId, msg.sender);

        if (tokenRequests[requestId].approvals >= approvalThreshold) {
            tokenRequests[requestId].approved = true;
        }
    }

    function rejectToken(bytes32 requestId) external onlyAdmin {
        require(tokenRequests[requestId].exists, "Request does not exist");
        require(!tokenRequests[requestId].approved, "Already approved by threshold");

        delete tokenRequests[requestId];
        emit TokenRejected(requestId);
    }

    function issueToken(bytes32 requestId) external {
        require(tokenRequests[requestId].exists, "Request does not exist");
        require(tokenRequests[requestId].approved, "Not approved by threshold");
        require(msg.sender == tokenRequests[requestId].creator, "Only the creator can issue the token");

        uint256 totalSupply = 8888888888;
        uint8 decimals = 18;

        Token newToken = new Token(
            tokenRequests[requestId].name,
            tokenRequests[requestId].symbol,
            decimals,
            totalSupply,
            tokenRequests[requestId].creator
        );

        delete tokenRequests[requestId];
        emit TokenIssued(requestId, address(newToken));
    }

    function updateAdmins(address[] memory _newAdmins, uint256 _newThreshold) external onlyOwner {
        require(_newAdmins.length > 0, "Admins required");
        require(_newThreshold > 0 && _newThreshold <= _newAdmins.length, "Invalid threshold");

        for (uint256 i = 0; i < admins.length; i++) {
            isAdmin[admins[i]] = false;
        }

        for (uint256 i = 0; i < _newAdmins.length; i++) {
            require(_newAdmins[i] != address(0), "Invalid admin address");
            isAdmin[_newAdmins[i]] = true;
        }

        admins = _newAdmins;
        approvalThreshold = _newThreshold;
    }

    function updateApprovalThreshold(uint256 _newThreshold) external onlyOwner {
        require(_newThreshold > 0 && _newThreshold <= admins.length, "Invalid threshold");
        emit ApprovalThresholdUpdated(approvalThreshold, _newThreshold);
        approvalThreshold = _newThreshold;
    }
}

contract Token is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 totalSupply,
        address creator
    ) ERC20(name, symbol) {
        _mint(creator, totalSupply * (10 ** uint256(decimals)));
    }
}