const TokenFactory = artifacts.require("TokenFactory");
const Token = artifacts.require("Token");
const { BN, expectRevert, expectEvent } = require("@openzeppelin/test-helpers");

contract("TokenFactory", (accounts) => {
    const [owner, admin1, admin2, admin3, user] = accounts;

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

    it("should allow the creator to issue an approved token", async function () {
        const requestId = await tokenFactory.requestToken.call("MyToken", "MTK", { from: user });
        await tokenFactory.requestToken("MyToken", "MTK", { from: user });

        await tokenFactory.approveToken(requestId, { from: admin1 });
        await tokenFactory.approveToken(requestId, { from: admin2 });

        const receipt = await tokenFactory.issueToken(requestId, { from: user });

        expectEvent(receipt, "TokenIssued", { requestId });

        const event = receipt.logs.find((log) => log.event === "TokenIssued");
        const tokenAddress = event.args.tokenAddress;

        const token = await Token.at(tokenAddress);
        assert.equal(await token.name(), "MyToken");
        assert.equal(await token.symbol(), "MTK");
        assert.equal((await token.totalSupply()).toString(), new BN("8888888888000000000000000000").toString());
        assert.equal((await token.balanceOf(user)).toString(), new BN("8888888888000000000000000000").toString());
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

    it("should reject unauthorized token issuances", async function () {
        const requestId = await tokenFactory.requestToken.call("MyToken", "MTK", { from: user });
        await tokenFactory.requestToken("MyToken", "MTK", { from: user });

        await tokenFactory.approveToken(requestId, { from: admin1 });
        await tokenFactory.approveToken(requestId, { from: admin2 });

        await expectRevert(
            tokenFactory.issueToken(requestId, { from: admin1 }),
            "Only the creator can issue the token"
        );
    });
});