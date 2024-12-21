// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./LinearBondingCurveToken.sol";

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

    function issueToken(bytes32 requestId) external payable {
        require(tokenRequests[requestId].exists, "Request does not exist");
        require(tokenRequests[requestId].approved, "Not approved yet");
        require(
            msg.sender == tokenRequests[requestId].creator,
            "Only creator can issue"
        );

        // 1. 새 본딩 커브 토큰 배포 (초기 공급량 0)
        LinearBondingCurveToken newToken = new LinearBondingCurveToken(
            tokenRequests[requestId].name,
            tokenRequests[requestId].symbol,
            owner() // factory 소유자 주소
        );

        // 2. Creator가 보낸 HSK가 있다면 => 새로 배포한 토큰에 buyTokensFor(creator) 실행
        if (msg.value > 0) {
            // newToken.buyTokensFor{value: msg.value}(msg.sender);
            // ↑ 이렇게 직접 호출해도 되지만,
            //   혹여나 컨트랙트 코드가 msg.sender == tx.origin 등 체크를 한다면
            //   이 로직 안에서 msg.sender는 factory이므로 문제가 될 수 있음.
            //   다만 여기서는 상관없으므로 그대로 호출 가능.

            newToken.buyTokensFor{value: msg.value}(msg.sender);
        }

        // 3. 요청 정보 삭제
        delete tokenRequests[requestId];

        // 4. 이벤트
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