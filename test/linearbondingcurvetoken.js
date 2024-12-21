const LinearBondingCurveToken = artifacts.require("LinearBondingCurveToken");
const { BN, expectRevert, ether } = require("@openzeppelin/test-helpers");

contract("LinearBondingCurveToken (fixed basePrice & slope)", (accounts) => {
    const [deployer, user, beneficiary] = accounts;

    // 코드 내에서 정의된 상수와 동일한 값
    // BASE_PRICE = 1e17 (0.1 ETH), SLOPE = 1e16 (0.01 ETH)
    // MAX_SUPPLY = 8888888888 * 1e18
    const EXPECTED_BASE_PRICE = new BN("100000000000000000"); // 1e17
    const EXPECTED_SLOPE      = new BN("10000000000000000");  // 1e16
    const EXPECTED_MAX_SUPPLY = new BN("8888888888").mul(new BN("1000000000000000000"));

    let token;

    async function getGasCost(txInfo) {
        // txInfo.tx => 트랜잭션 해시
        // txInfo.receipt => { gasUsed, ... }
        const txHash = txInfo.tx;
        const gasUsed = new BN(txInfo.receipt.gasUsed);

        // web3.eth.getTransaction(txHash) => { gasPrice, ... }
        const tx = await web3.eth.getTransaction(txHash);
        const gasPrice = new BN(tx.gasPrice);

        return gasUsed.mul(gasPrice); // = 가스비 총합(wei)
    }

    beforeEach(async () => {
        // 컨트랙트 배포
        token = await LinearBondingCurveToken.new(
            "FixedLinearToken",  // name
            "FLT",               // symbol
            deployer,           // factoryOwner
            { from: deployer }
        );
    });

    it("should have correct constants and initial state", async () => {
        const name = await token.name();
        const symbol = await token.symbol();
        const totalSupply = await token.totalSupply();
        const factoryOwner = await token.factoryOwner();
        const decimals = await token.decimals();

        // 컨트랙트 내 상수 조회
        const basePrice = await token.BASE_PRICE();
        const slope = await token.SLOPE();
        const maxSupply = await token.MAX_SUPPLY();

        assert.equal(name, "FixedLinearToken", "Name mismatch");
        assert.equal(symbol, "FLT", "Symbol mismatch");
        assert(totalSupply.eq(new BN("0")), "Initial totalSupply != 0");
        assert.equal(factoryOwner, deployer, "factoryOwner mismatch");
        assert.equal(decimals.toString(), "18", "decimals should be 18");

        // 컨트랙트의 상수 값이 우리가 기대하는 값과 일치하는지
        assert(basePrice.eq(EXPECTED_BASE_PRICE), "BASE_PRICE mismatch");
        assert(slope.eq(EXPECTED_SLOPE), "SLOPE mismatch");
        assert(maxSupply.eq(EXPECTED_MAX_SUPPLY), "MAX_SUPPLY mismatch");
    });

    it("getPrice(0) should be BASE_PRICE", async () => {
        const price0 = await token.getPrice(new BN("0"));
        assert(price0.eq(EXPECTED_BASE_PRICE), "Price at supply=0 should match BASE_PRICE");
    });

    it("getPrice(1e18) should be BASE_PRICE + SLOPE", async () => {
        // supply=1e18 => price = basePrice + slope
        const oneToken = new BN("1000000000000000000"); // 1e18
        const price1Token = await token.getPrice(oneToken);

        const expected = EXPECTED_BASE_PRICE.add(EXPECTED_SLOPE);
        assert(price1Token.eq(expected), `Price mismatch for 1 token supply`);
    });

    it("buyTokens should mint tokens for caller", async () => {
        const value = ether("1");
        await token.buyTokens({ from: user, value });

        const userBalance = await token.balanceOf(user);
        const totalSupply = await token.totalSupply();

        assert(userBalance.gt(new BN("0")), "User balance should be > 0");
        assert(totalSupply.eq(userBalance), "Total supply should match user balance if it's the first purchase");
    });

    it("buyTokensFor should mint tokens for beneficiary", async () => {
        const value = ether("1");
        await token.buyTokensFor(beneficiary, { from: user, value });

        const beneficiaryBalance = await token.balanceOf(beneficiary);
        const totalSupply = await token.totalSupply();

        assert(beneficiaryBalance.gt(new BN("0")), "Beneficiary balance should be > 0");
        assert(totalSupply.eq(beneficiaryBalance), "Total supply should match beneficiary balance if it's the first purchase");
    });

    it("buy & sell with gas cost calculation", async () => {
        // 1) 사용자(user)의 초기 ETH 잔액
        const userInitialEth = new BN(await web3.eth.getBalance(user));

        // 2) 1 ETH로 buyTokens
        const buyValue = ether("1");
        const buyTx = await token.buyTokens({ from: user, value: buyValue });
        const buyGasCost = await getGasCost(buyTx);

        // 3) 구매 후 user's ETH 잔액
        const userEthAfterBuy = new BN(await web3.eth.getBalance(user));
        // 기대되는 잔액 = 초기 - 구매액(1 ETH) - 가스비
        const expectedEthAfterBuy = userInitialEth.sub(buyValue).sub(buyGasCost);

        // 오차 없이 정확히 일치해야 함
        assert.equal(
            userEthAfterBuy.toString(),
            expectedEthAfterBuy.toString(),
            "User's ETH balance after buy is incorrect (gas cost not accounted)"
        );

        // 4) 구매한 토큰 수 확인
        const userTokenBalance = await token.balanceOf(user);
        assert(userTokenBalance.gt(new BN("0")), "User did not receive tokens");

        // 5) 절반만 매도
        const tokensToSell = userTokenBalance.div(new BN("2"));
        const userEthBeforeSell = new BN(await web3.eth.getBalance(user));

        // (참고) 현재 totalSupply() = userTokenBalance (첫 구매자가 전량 보유)
        //       sell 시에는 totalSupply() 기준 가격을 다시 계산
        const totalSupplyBeforeSell = await token.totalSupply();
        const pricePerToken = await token.getPrice(totalSupplyBeforeSell);
        // 매도 수익 (단순 = tokenAmount * pricePerToken / 1e18)
        const expectedRevenue = tokensToSell.mul(pricePerToken).div(new BN("1000000000000000000"));

        // 매도 트랜잭션
        const sellTx = await token.sellTokens(tokensToSell, { from: user });
        const sellGasCost = await getGasCost(sellTx);

        // 6) 매도 후 user's ETH 잔액
        const userEthAfterSell = new BN(await web3.eth.getBalance(user));
        // 기대되는 잔액 = 매도 전 잔액 + 매도수익 - 가스비
        const expectedEthAfterSell = userEthBeforeSell.add(expectedRevenue).sub(sellGasCost);

        assert.equal(
            userEthAfterSell.toString(),
            expectedEthAfterSell.toString(),
            "User's ETH balance after sell is incorrect (gas cost / revenue mismatch)"
        );

        // 7) 남은 토큰 잔액은 전체의 절반
        const userTokenBalanceFinal = await token.balanceOf(user);
        assert(
            userTokenBalanceFinal.eq(userTokenBalance.sub(tokensToSell)),
            "Final token balance mismatch after sell"
        );
    });

    it("should revert if 0 HSK sent", async () => {
        await expectRevert(
            token.buyTokens({ from: user, value: 0 }),
            "No HSK sent"
        );
    });

    it("should revert if beneficiary is zero address", async () => {
        await expectRevert(
            token.buyTokensFor("0x0000000000000000000000000000000000000000", { from: user, value: ether("1") }),
            "Invalid beneficiary"
        );
    });

    /*
    it("should revert if purchase exceeds MAX_SUPPLY", async () => {
        // 매우 큰 HSK를 보내, 한 번에 supply>MAX_SUPPLY가 되도록
        await expectRevert(
            token.buyTokens({ from: user, value: ether("10000000") }),
            "Exceeds max supply"
        );
    });

     */
});