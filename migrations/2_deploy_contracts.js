const TokenFactory = artifacts.require("TokenFactory");

module.exports = async function (deployer, network, accounts) {
  const adminAddresses = [accounts[1], accounts[2], accounts[3], accounts[4]];
  const approvalThreshold = 2;

  await deployer.deploy(TokenFactory, adminAddresses, approvalThreshold, { from: accounts[0] });
};
