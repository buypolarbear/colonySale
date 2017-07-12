var ColonyTokenSale = artifacts.require("./ColonyTokenSale.sol");
var Token = artifacts.require("./Token.sol");
var Resolver = artifacts.require("./Resolver.sol");
var EtherRouter = artifacts.require('./EtherRouter.sol');
var Ownable = artifacts.require('./Ownable.sol');
var MultiSigWallet = artifacts.require('multisig-wallet/MultiSigWallet.sol');

import testHelper from '../helpers/test-helper';

contract('ColonyTokenSale', function(accounts) {
  const COINBASE_ACCOUNT = accounts[0];
  const ACCOUNT_TWO = accounts[1];
  const ACCOUNT_THREE = accounts[2];

  // Initialised at the start of test in `before` call
  let ownable;
  let tokenDeployed;
  let resolver;

  // Set via createColonyTokenSale function
  let etherRouter;
  let token;
  let colonyMultisig;
  let colonySale;

  // Sale properties
  let softCapInWei;
  let minAmountToRaise;

  before(async function () {
    ownable = await Ownable.deployed();
    tokenDeployed = await Token.deployed();
    resolver = await Resolver.new(tokenDeployed.address);
  });

  // Setup blank token and token sale with given parameters
  const createColonyTokenSale = async function (startBlock, minToRaise, softCap, postSoftCapMinBlocks, postSoftCapMaxBlocks, maxSaleDuration) {
    etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    token = await Token.at(etherRouter.address);
    colonyMultisig = await MultiSigWallet.new([COINBASE_ACCOUNT], 1);
    colonySale = await ColonyTokenSale.new(startBlock, minToRaise, softCap, postSoftCapMinBlocks, postSoftCapMaxBlocks, maxSaleDuration, etherRouter.address, colonyMultisig.address);
  };

  const createColonyTokenSaleWithInvalidMultiSig = async function (startBlock, minToRaise, softCap, postSoftCapMinBlocks, postSoftCapMaxBlocks, maxSaleDuration) {
    let etherRouter = await EtherRouter.new();
    await etherRouter.setResolver(resolver.address);
    token = await Token.at(etherRouter.address);
    colonyMultisig = await MultiSigWallet.new([COINBASE_ACCOUNT], 1);
    colonySale = await ColonyTokenSale.new(startBlock, minToRaise, softCap, postSoftCapMinBlocks, postSoftCapMaxBlocks, maxSaleDuration, etherRouter.address, ownable.address);
  };

  describe('sale initialisation', () => {
    beforeEach(async function () {
      softCapInWei = web3.toWei(50000, 'ether');
      minAmountToRaise = web3.toWei(20000, 'ether');
      await createColonyTokenSale(4000000, minAmountToRaise, softCapInWei, 635, 5082, 71153);
    });

    it("should return correct current block number", async function () {
      await testHelper.stopMining();
      const currentBlock = await colonySale.getBlockNumber.call();
      const currentActualBlock = web3.eth.blockNumber;
      await testHelper.startMining();
      assert.equal(currentActualBlock, currentBlock.toNumber());
    });

    it("should have correct sale start block", async function () {
      const startBlock = await colonySale.startBlock.call();
      assert.equal(startBlock.toNumber(), 4000000);
    });

    it("should have correct initial sale end block", async function () {
      const endBlock = await colonySale.endBlock.call();
      assert.equal(endBlock.toNumber(), 4071153);
    });

    it("should have correct minimum amount to raise", async function () {
      const endBlock = await colonySale.minToRaise.call();
      assert.equal(endBlock.toNumber(), web3.toWei(20000, 'ether'));
    });

    it("should have correct min post soft cap blocks duration", async function () {
      const postSoftCapMinBlocks = await colonySale.postSoftCapMinBlocks.call();
      assert.equal(postSoftCapMinBlocks.toNumber(), 635);
    });

    it("should have correct max post soft cap blocks duration", async function () {
      const postSoftCapMaxBlocks = await colonySale.postSoftCapMaxBlocks.call();
      assert.equal(postSoftCapMaxBlocks.toNumber(), 5082);
    });

    it("should throw if initialised with invalid block duration parameters", async function () {
      try {
        await ColonyTokenSale.new(4000000, 20000, softCapInWei, 0, 5082, 71153, etherRouter.address, colonyMultisig.address);
      } catch (e) {
        testHelper.ifUsingTestRPC(e);
      }

      try {
        await ColonyTokenSale.new(4000000, 20000, softCapInWei, 635, 635, 71153, etherRouter.address, colonyMultisig.address);
      } catch (e) {
        testHelper.ifUsingTestRPC(e);
      }
    });

    it("should have CLNY token wei price of 1 finney", async function () {
      const tokenPrice = await colonySale.tokenPrice.call();
      const oneFinney = web3.toWei(1, 'finney');
      assert.equal(tokenPrice.toNumber(), oneFinney);
    });

    it("should have minimum contribution of 1 finney", async function () {
      const minimumContribution = await colonySale.minimumContribution.call();
      const oneFinney = web3.toWei(1, 'finney');
      assert.equal(minimumContribution.toNumber(), oneFinney);
    });

    it("should have correct soft cap", async function () {
      const softCap = await colonySale.softCap.call();
      assert.equal(softCap.toNumber(), web3.toWei('50000', 'ether'));
    });

    it("should have set the Token address", async function () {
      const tokenAddress = await colonySale.token.call();
      assert.equal(tokenAddress, etherRouter.address);
    });
  });

  describe('before sale start block is reached', () => {
    beforeEach('setup future startBlock', async () => {
      const currentBlock = web3.eth.blockNumber;
      const startBlock = currentBlock + 30;
      await createColonyTokenSale(startBlock, 300, 1000, 5, 10, 20);
    });

    it("should NOT accept contributions", async function () {
      const colonySaleBalanceBefore = web3.eth.getBalance(colonyMultisig.address);
      const amountInWei = web3.toWei(1, 'finney');
      try {
        web3.eth.sendTransaction({ from: COINBASE_ACCOUNT, to: colonySale.address, value: amountInWei });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const colonySaleBalanceAfter = web3.eth.getBalance(colonyMultisig.address);
      assert.equal(colonySaleBalanceAfter.toNumber(), colonySaleBalanceBefore.toNumber());
      const totalRaised = await colonySale.totalRaised.call();
      assert.equal(totalRaised.toNumber(), 0);
    });
  });

  describe('when sale start block is reached', async () => {
    beforeEach('setup sale at startBlock', async () => {
      const currentBlock = await web3.eth.blockNumber;
      await createColonyTokenSale(currentBlock, web3.toWei(0.3, 'ether'), web3.toWei(1, 'ether'), 5, 7, 18);
      // Send the min contribution as a start
      await colonySale.send(web3.toWei(1, 'finney'));
    });

    it("should accept contributions before the soft cap is reached", async function () {
      await testHelper.sendEther(COINBASE_ACCOUNT, colonySale.address, 1, 'finney');
      const colonySaleBalanceAfter = await web3.eth.getBalance(colonyMultisig.address);
      const TwoFinney = web3.toWei(2, 'finney');
      assert.equal(colonySaleBalanceAfter.toNumber(), TwoFinney);
      const userBuy = await colonySale.userBuys.call(COINBASE_ACCOUNT);
      assert.equal(userBuy.toNumber(), TwoFinney);
    });

    it("contributions should log Puchase events", async function () {
      const tx = await colonySale.send(web3.toWei(1, 'finney'));
      assert.equal(tx.logs[0].event, 'Purchase');
    });

    it("should NOT accept contributions less than the minimum of 1 finney", async function () {
      try {
        await testHelper.sendEther(ACCOUNT_TWO, colonySale.address, 10, 'wei');
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const colonySaleBalanceAfter = web3.eth.getBalance(colonyMultisig.address);
      assert.equal(colonySaleBalanceAfter.toNumber(), web3.toWei(1, 'finney'));
    });

    it("should throw if cannot forward funds to multisig wallet", async function () {
      const currentBlock = await web3.eth.blockNumber;
      await createColonyTokenSaleWithInvalidMultiSig(currentBlock, web3.toWei(1, 'ether'), 5, 7, 18);
      try {
        await testHelper.sendEther(ACCOUNT_TWO, colonySale.address, 1, 'finney');
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const totalSupply = await token.totalSupply.call();
      assert.equal(totalSupply.toNumber(), 0);
    });

    it("should NOT be able to finalize sale", async function () {
      try {
        await colonySale.finalize();
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const saleFinalised = await colonySale.saleFinalized.call();
      assert.isFalse(saleFinalised);
    });

    it("should NOT be able to claim tokens", async function () {
      try {
        let txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
        await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balanceOfTokenholder = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(balanceOfTokenholder.toNumber(), 0);
    });

    it.skip('should fail to transfer tokens too early', async function () {

    });
  });

  describe('when soft cap reached', async () => {
    const softCap = web3.toWei(10, 'finney');
    const postSoftCapMinBlocks = 6;
    const postSoftCapMaxBlocks = 8;
    const maxSaleDuration = 20;

    beforeEach(async () => {
      await createColonyTokenSale(web3.eth.blockNumber, web3.toWei(3, 'finney'), softCap, postSoftCapMinBlocks, postSoftCapMaxBlocks, maxSaleDuration);
    });

    it('while under the postSoftCapMinBlocks, should set remainder duration to postSoftCapMinBlocks', async function () {
      // Reach the softCap
      await colonySale.send(softCap, { from: COINBASE_ACCOUNT });
      const currentBlock = web3.eth.blockNumber;
      const endBlock = await colonySale.endBlock.call();
      assert.equal(endBlock.toNumber(), currentBlock + postSoftCapMinBlocks);
    });

    it('while over postSoftCapMinBlocks but under postSoftCapMaxBlocks, should set remainder duration to that amount of blocks', async function () {
      const startBlock = await colonySale.startBlock.call();
      testHelper.forwardToBlock(startBlock.plus(postSoftCapMinBlocks - 1).toNumber());
      // Reach the softCap
      await colonySale.send(softCap, { from: COINBASE_ACCOUNT });
      const currentBlock = web3.eth.blockNumber;
      const endBlock = await colonySale.endBlock.call();
      assert.equal(endBlock.toNumber(), currentBlock + postSoftCapMinBlocks);
    });

    it('while over postSoftCapMaxBlocks, should set remainder duration to postSoftCapMaxBlocks', async function () {
      const startBlock = await colonySale.startBlock.call();
      testHelper.forwardToBlock(startBlock.plus(postSoftCapMaxBlocks).toNumber());
      // Reach the softCap
      await colonySale.send(softCap, { from: COINBASE_ACCOUNT });
      const currentBlock = web3.eth.blockNumber;
      const endBlock = await colonySale.endBlock.call();
      assert.equal(endBlock.toNumber(), currentBlock + postSoftCapMaxBlocks);
    });

    it('while over postSoftCapMaxBlocks and over longest-sale-duration block should keep remainder duration to longest-sale-duration block (default)',
    async function () {
      const startBlock = await colonySale.startBlock.call();
      testHelper.forwardToBlock(startBlock.plus(15).toNumber());
      // Reach the softCap
      await colonySale.send(softCap, { from: COINBASE_ACCOUNT });
      const endBlock = await colonySale.endBlock.call();
      assert.equal(endBlock.toNumber(), startBlock.plus(maxSaleDuration).toNumber());
    });

    it("should NOT be able to finalize sale", async function () {
      try {
        await colonySale.finalize();
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const saleFinalised = await colonySale.saleFinalized.call();
      assert.isFalse(saleFinalised);
    });

    it("should NOT be able to claim tokens", async function () {
      try {
        let txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
        await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balanceOfTokenholder = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(balanceOfTokenholder.toNumber(), 0);
    });
  });

  describe('when sale is successful, i.e. endBlock reached and raised minimum amount', () => {
    beforeEach('setup a closed sale', async () => {
      const softCap = web3.toWei(3, 'ether');
      const currentBlock = web3.eth.blockNumber;
      await createColonyTokenSale(currentBlock, web3.toWei(1, 'finney'), softCap, 5, 10, 20);
      // Add purchases for 3 ether 18 finney in total
      await testHelper.sendEther(COINBASE_ACCOUNT, colonySale.address, 4, 'finney');
      await testHelper.sendEther(ACCOUNT_TWO, colonySale.address, 1, 'ether');
      await testHelper.sendEther(ACCOUNT_THREE, colonySale.address, 12, 'finney');
      await testHelper.sendEther(ACCOUNT_TWO, colonySale.address, 1, 'finney');
      await testHelper.sendEther(ACCOUNT_THREE, colonySale.address, 2, 'ether');
      // Get the endBlock and fast forward to it
      const endBlock = await colonySale.endBlock.call();
      testHelper.forwardToBlock(endBlock.toNumber());
    });

    it("should NOT accept contributions", async function () {
      const colonySaleBalanceBefore = web3.eth.getBalance(colonyMultisig.address);
      const totalRaisedBefore = await colonySale.totalRaised.call();
      const amountInWei = web3.toWei(1, 'finney');
      try {
        web3.eth.sendTransaction({ from: COINBASE_ACCOUNT, to: colonySale.address, value: amountInWei });
      } catch(err) {
        testHelper.ifUsingTestRPC(err);
      }
      const colonySaleBalanceAfter = web3.eth.getBalance(colonyMultisig.address);
      assert.equal(colonySaleBalanceAfter.toNumber(), colonySaleBalanceBefore.toNumber());
      const totalRaisedAfter = await colonySale.totalRaised.call();
      assert.equal(totalRaisedAfter.toNumber(), totalRaisedBefore.toNumber());
      const userBuy = await colonySale.userBuys.call(COINBASE_ACCOUNT);
      assert.equal(userBuy.toNumber(), web3.toWei(4, 'finney'));
    });

    it("when sale NOT yet finalized, should NOT be able to claim tokens", async function () {
      try {
        let txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
        await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balanceOfTokenholder = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(balanceOfTokenholder.toNumber(), 0);
    });

    it("when minToRaise has been reached, should be able to finalize sale", async function () {
      const tx = await colonySale.finalize();
      assert.equal(tx.logs[0].event, 'SaleFinalized');
      const saleFinalised = await colonySale.saleFinalized.call();
      assert.isTrue(saleFinalised);
    });

    it("when sale finalised, should NOT be able to finalize sale again", async function () {
      await colonySale.finalize();

      try {
        await colonySale.finalize();
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const saleFinalised = await colonySale.saleFinalized.call();
      assert.isTrue(saleFinalised);
    });

    it("when sale finalized, should mint correct total retained tokens", async function () {
      const totalRaised = await colonySale.totalRaised.call();
      const tokenPrice = await colonySale.tokenPrice.call();
      await colonySale.finalize();
      const tokenSupply = await token.totalSupply.call();
      assert.equal(tokenSupply.toNumber(), 6034);
      assert.equal(totalRaised.div(tokenPrice).mul(2).toNumber(), 6034);
    });

    it("when sale finalized, buyers should be able to claim their tokens", async function () {
      await colonySale.finalize();

      // Initially their balance is 0
      const tokenBalance1Pre = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(tokenBalance1Pre.toNumber(), 0);
      const tokenBalance2Pre = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(tokenBalance2Pre.toNumber(), 0);
      const tokenBalance3Pre = await token.balanceOf.call(ACCOUNT_THREE);
      assert.equal(tokenBalance3Pre.toNumber(), 0);
      // Claim tokens for account
      let txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
      await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      const tokenBalance1 = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(tokenBalance1.toNumber(), 4);

      txData = await colonySale.contract.claim.getData(ACCOUNT_TWO);
      await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      const tokenBalance2 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(tokenBalance2.toNumber(), 1001);

      txData = await colonySale.contract.claim.getData(ACCOUNT_THREE);
      await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      const tokenBalance3 = await token.balanceOf.call(ACCOUNT_THREE);
      assert.equal(tokenBalance3.toNumber(), 2012);
    });

    it("when sale is finalized and tokens claimed, that account balance in userBuys should be set to 0", async function () {
      await colonySale.finalize();
      const txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
      await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });

      const userBuy = await colonySale.userBuys.call(COINBASE_ACCOUNT);
      assert.equal(userBuy.toNumber(), 0);
    });

    it.skip("when sale is finalized and tokens claimed, claim event should be logged", async function () {
      await colonySale.finalize();
      const txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
      const tx = await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      // Cannot get the logs below the multisig parent transaction
      assert.equal(tx.logs[2].event, 'Claim');
      const userBuy = await colonySale.userBuys.call(COINBASE_ACCOUNT);
      assert.equal(userBuy.toNumber(), 0);
    });

    it("should NOT be able to claim tokens, if called by anyone but colonyMultisig", async function () {
      try {
        let txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
        await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: ACCOUNT_TWO });
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balanceOfTokenholder = await token.balanceOf.call(COINBASE_ACCOUNT);
      assert.equal(balanceOfTokenholder.toNumber(), 0);
    });
  });

  describe('when sale is unsuccessful, i.e. endBlock reached without raising minimum amount', () => {
    beforeEach('setup unsuccessful sale', async () => {
      const softCap = web3.toWei(10, 'finney');
      const currentBlock = web3.eth.blockNumber;
      await createColonyTokenSale(currentBlock, web3.toWei(3, 'finney'), softCap, 5, 10, 20);
      // Reach the soft cap
      //TODO: standardise the way we send ether. testHelper vs .send
      testHelper.sendEther(ACCOUNT_TWO, colonySale.address, 1, 'finney');
      testHelper.sendEther(ACCOUNT_THREE, colonySale.address, 1, 'finney');
      // Get the endBlock and fast forward to it
      const endBlock = await colonySale.endBlock.call();
      testHelper.forwardToBlock(endBlock.toNumber());
    });

    it("should NOT be able to finalize sale", async function () {
      try {
        await colonySale.finalize();
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const saleFinalised = await colonySale.saleFinalized.call();
      assert.isFalse(saleFinalised);
    });

    it("should NOT be able to claim tokens", async function () {
      try {
        let txData = await colonySale.contract.claim.getData(COINBASE_ACCOUNT);
        await colonyMultisig.submitTransaction(colonySale.address, 0, txData, { from: COINBASE_ACCOUNT });
      } catch (err) {
        testHelper.ifUsingTestRPC(err);
      }

      const balanceOfTokenholder1 = await token.balanceOf.call(ACCOUNT_TWO);
      assert.equal(balanceOfTokenholder1.toNumber(), 0);
      const balanceOfTokenholder2 = await token.balanceOf.call(ACCOUNT_THREE);
      assert.equal(balanceOfTokenholder2.toNumber(), 0);
    });
  });

  describe.skip('Two years after public sale completes', () => {
  });
});
