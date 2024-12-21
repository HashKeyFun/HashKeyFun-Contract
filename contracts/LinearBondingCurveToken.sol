// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title LinearBondingCurveToken
 * @dev 선형 본딩 커브 모델 (basePrice와 slope가 고정)
 *      price(s) = BASE_PRICE + SLOPE * (s / 1e18)
 *
 * - decimals = 18 (ERC20 기본)
 * - MAX_SUPPLY = 8,888,888,888 * 10^18
 * - BASE_PRICE(고정, 예: 0.1 HSK = 1e17)
 * - SLOPE(고정, 예: 0.01 HSK = 1e16)
 */
contract LinearBondingCurveToken is ERC20 {
    // 최대 공급량 (8,888,888,888 * 10^18)
    uint256 public constant MAX_SUPPLY = 8888888888 * 1e18;

    // basePrice와 slope를 고정 (예시값)
    // basePrice = 0.1 HSK (1e17 wei)
    // slope     = 0.01 HSK (1e16 wei)
    uint256 public constant BASE_PRICE = 1e17;
    uint256 public constant SLOPE = 1e16;

    address public factoryOwner;

    constructor(
        string memory name_,
        string memory symbol_,
        address _factoryOwner
    ) ERC20(name_, symbol_) {
        factoryOwner = _factoryOwner;
    }

    /**
     * @dev 선형 가격: price(s) = BASE_PRICE + (SLOPE * (s / 1e18))
     *      s = totalSupply() (18 decimals)
     */
    function getPrice(uint256 _supply) public pure returns (uint256) {
        require(_supply < MAX_SUPPLY, "Max supply reached");
        // slope * s / 1e18
        uint256 linearPart = (SLOPE * _supply) / 1e18;
        return BASE_PRICE + linearPart;
    }

    /**
     * @dev HSK로 토큰 구매 (msg.sender가 토큰 받음)
     */
    function buyTokens() external payable {
        buyTokensFor(msg.sender);
    }

    /**
     * @dev 대리 구매 (beneficiary에게 토큰 지급)
     */
    function buyTokensFor(address beneficiary) public payable {
        require(msg.value > 0, "No HSK sent");
        require(beneficiary != address(0), "Invalid beneficiary");

        uint256 currentSupply = totalSupply();
        require(currentSupply < MAX_SUPPLY, "Max supply reached");

        // 1개당 가격(wei)
        uint256 pricePerToken = getPrice(currentSupply);
        require(pricePerToken > 0, "Price must be > 0");

        // 구매 가능한 토큰 개수 (18 decimals)
        // tokensToMint = (msg.value * 1e18) / pricePerToken
        uint256 tokensToMint = (msg.value * 1e18) / pricePerToken;

        // 민팅 후 supply가 MAX_SUPPLY 넘어서는지 체크
        require(currentSupply + tokensToMint <= MAX_SUPPLY, "Exceeds max supply");

        // 민팅
        _mint(beneficiary, tokensToMint);

        // (옵션) 수수료 처리
        // payable(factoryOwner).transfer(msg.value);
    }

    function sellTokens(uint256 tokenAmount) external {
        require(tokenAmount > 0, "Cannot sell 0 tokens");
        // 사용자가 충분한 토큰을 보유 중인지 확인
        require(balanceOf(msg.sender) >= tokenAmount, "Not enough tokens to sell");

        uint256 currentSupply = totalSupply();
        // 현재 공급량보다 더 많은 토큰을 소각할 수 없음
        require(currentSupply >= tokenAmount, "Exceeds total supply");

        // 단순히 '현재 supply' 기준으로 1개당 가격을 구함
        // (buyTokens와 같은 접근, 적분 미사용)
        uint256 pricePerToken = getPrice(currentSupply);

        // 실제 매도 시 받을 수 있는 HSK(wei)
        // tokensToSell * pricePerToken / 1e18 (토큰은 18자리 소수점)
        uint256 revenue = (tokenAmount * pricePerToken) / 1e18;

        // 컨트랙트 내에 충분한 잔액이 있어야 함
        require(address(this).balance >= revenue, "Not enough liquidity in contract");

        // 토큰 소각(유저 보유분 감소)
        _burn(msg.sender, tokenAmount);

        // HSK(ETH) 전송
        payable(msg.sender).transfer(revenue);
    }
}