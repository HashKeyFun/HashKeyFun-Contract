const TokenFactory = artifacts.require("TokenFactory");
const BondingCurveToken = artifacts.require("BondingCurveToken");
const { BN, expectRevert, expectEvent, ether} = require("@openzeppelin/test-helpers");

contract("TokenFactory", (accounts) => {
    const [owner, admin1, admin2, admin3, user, other] = accounts;

    let tokenFactory;

    beforeEach(async function () {
        const adminAddresses = [admin1, admin2, admin3];
        const approvalThreshold = 2;

        tokenFactory = await TokenFactory.new(adminAddresses, approvalThreshold, { from: owner });
    });

    it("should allow a user to request a token", async function () {
        const receipt = await tokenFactory.requestToken("MyToken", "MTK", { from: user });

        expectEvent(receipt, "TokenRequested", {
            creator: user,
            name: "MyToken",
            symbol: "MTK"
        });
    });

    it("should allow admins to approve a token request", async function () {
        const requestId = await tokenFactory.requestToken.call("MyToken", "MTK", { from: user });
        await tokenFactory.requestToken("MyToken", "MTK", { from: user });

        await tokenFactory.approveToken(requestId, { from: admin1 });
        let request = await tokenFactory.tokenRequests(requestId);
        assert.equal(request.approvals.toString(), "1");

        await tokenFactory.approveToken(requestId, { from: admin2 });
        request = await tokenFactory.tokenRequests(requestId);
        assert.isTrue(request.approved);
    });

    it("should allow the creator to issue an approved token WITHOUT sending HSK (no immediate purchase)", async function () {
        // 1) 토큰 발행 요청
        const requestId = await tokenFactory.requestToken.call("MyToken", "MTK", { from: user });
        await tokenFactory.requestToken("MyToken", "MTK", { from: user });

        // 2) 어드민 승인
        await tokenFactory.approveToken(requestId, { from: admin1 });
        await tokenFactory.approveToken(requestId, { from: admin2 });

        // 3) issueToken 호출 (HSK 없이)
        const receipt = await tokenFactory.issueToken(requestId, { from: user, value: 0 });

        expectEvent(receipt, "TokenIssued", { requestId });

        // 4) 이벤트 로그에서 새 토큰 주소 확인
        const event = receipt.logs.find((log) => log.event === "TokenIssued");
        const tokenAddress = event.args.tokenAddress;

        // 5) BondingCurveToken 인스턴스화
        const token = await BondingCurveToken.at(tokenAddress);
        assert.equal(await token.name(), "MyToken");
        assert.equal(await token.symbol(), "MTK");

        // 6) 발행 직후에는 아무도 토큰을 보유하지 않음 (민팅x)
        const totalSupply = await token.totalSupply();
        assert(totalSupply.eq(new BN("0")), "Initial total supply should be 0");
        const userBalance = await token.balanceOf(user);
        assert(userBalance.eq(new BN("0")), "User balance should be 0 if no HSK sent");
    });

    it("should allow the creator to issue an approved token AND buy some tokens with HSK immediately", async function () {
        // 1) 토큰 발행 요청
        const requestId = await tokenFactory.requestToken.call("MyToken2", "MTK2", { from: user });
        await tokenFactory.requestToken("MyToken2", "MTK2", { from: user });

        // 2) 어드민 승인
        await tokenFactory.approveToken(requestId, { from: admin1 });
        await tokenFactory.approveToken(requestId, { from: admin2 });

        // 3) issueToken 호출 시, user가 HSK를 함께 보냄 (예: 1 HSK)
        const valueToSend = ether("1"); // 1 HSK
        const receipt = await tokenFactory.issueToken(requestId, { from: user, value: valueToSend });

        expectEvent(receipt, "TokenIssued", { requestId });

        // 4) 이벤트 로그에서 새 토큰 주소 확인
        const event = receipt.logs.find((log) => log.event === "TokenIssued");
        const tokenAddress = event.args.tokenAddress;

        // 5) BondingCurveToken 인스턴스화
        const token = await BondingCurveToken.at(tokenAddress);

        // 6) 초기 공급량(배포 후)은 0이지만, issueToken 내부에서 user가 buyTokensFor()로 구매
        //    => 따라서 user는 일부 토큰을 즉시 갖게 됨
        const totalSupplyAfter = await token.totalSupply();
        const userBalanceAfter = await token.balanceOf(user);

        // (참고) 단순히 "0보다 크다"는 정도만 확인할 수도 있음.
        // getPrice() 공식: price = A * (supply^B) / 1e18
        // 여기서는 supply=0일 때 price= A * (0^B) = 0 → 사실상 첫 구매 시 아주 싼 값이지만,
        //  실제로는 0이 아니라는 점(수식 등)을 신경 써야 함. (테스트 예시는 단순 확인)
        assert(totalSupplyAfter.gt(new BN("0")), "There should be some tokens minted");
        assert(userBalanceAfter.gt(new BN("0")), "User should have some tokens minted after buying");

        // 7) 추가적으로 실제 산 토큰 양이 올바른지(본딩커브 공식)를 계산하여 비교할 수도 있음
        //    - 예: price = A * (supply^B) / 1e18.  첫 supply=0 → price=0?
        //      => 실제 구현 시 0 공급량에 대한 예외처리가 있을 수도 있으니 유의.
        //    - 여기서는 단순히 "민팅되었다"는 사실만 확인.

        // 8) 이후에 user 혹은 다른 주소들이 buyTokens()를 통해 추가 구매 가능
    });

    it("should fail if non-creator tries to issue the token", async function () {
        // 1) 토큰 발행 요청
        const requestId = await tokenFactory.requestToken.call("MyToken3", "MTK3", { from: user });
        await tokenFactory.requestToken("MyToken3", "MTK3", { from: user });

        // 2) 어드민 승인
        await tokenFactory.approveToken(requestId, { from: admin1 });
        await tokenFactory.approveToken(requestId, { from: admin2 });

        // 3) creator가 아닌 다른 사람이 issueToken 시도 → revert 예상
        await expectRevert(
            tokenFactory.issueToken(requestId, { from: other, value: ether("1") }),
            "Only creator can issue"
        );
    });

    it("should allow the owner to update the approval threshold", async function () {
        await tokenFactory.updateApprovalThreshold(3, { from: owner });
        const newThreshold = await tokenFactory.approvalThreshold();
        assert.equal(newThreshold.toString(), "3");
    });

    it("should reject unauthorized updates to the approval threshold", async function () {
        await expectRevert(
            tokenFactory.updateApprovalThreshold(3, { from: user }),
            "Ownable: caller is not the owner"
        );
    });
});