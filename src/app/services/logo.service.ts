import { Injectable } from '@angular/core';
import { Chain, ChainHelper, TokenType } from './util.service'

@Injectable({
  providedIn: 'root'
})
export class LogoService {
  readonly PATH_PREFIX = './assets/logos/';
  readonly DEFAULT_LOGO = 'default.png';

  private tokenLogos: {[chainAddress: string]: string} = {};

  constructor() { 
    for (let i of tokenLogoMaps) {
      const key = `${i[0]}_${i[1]}`;
      this.tokenLogos[key] = i[2];
    }
  }

  getTokenLogo(chain: Chain | string, address: string): string {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const key = `${chain}_${address}`;
    let logo = this.tokenLogos[key];
    if (!logo) {
      logo = this.DEFAULT_LOGO;
    }
    if (logo.startsWith('http')) {
      return logo;
    }
    return this.PATH_PREFIX + logo;
  }

  getTokenLogos(): TokenLogoMap[] {
    return tokenLogoMaps;
  }

  getChainLogo(chain: Chain | string): string {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const map = chainLogoMaps.find(x => chain === x[0]);
    const logo = map ? map[1] : this.DEFAULT_LOGO;
    if (logo.startsWith('http')) {
      return logo;
    }
    return this.PATH_PREFIX + logo;
  }

  hasLogo(chain: Chain | string, address: string): boolean {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const key = `${chain}_${address}`;
    return !!this.tokenLogos[key];
  }

}

type ChainLogoMap = [Chain, string];
const chainLogoMaps: ChainLogoMap[] = [
  [Chain.RAICOIN, 'raicoin.png'],
  [Chain.ETHEREUM, 'ethereum.png'],
  [Chain.BINANCE_SMART_CHAIN, 'binance-smart-chain.png'],

  [Chain.RAICOIN_TEST, 'raicoin.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, 'binance-smart-chain.png'],
  [Chain.ETHEREUM_TEST_GOERLI, 'ethereum.png'],
]

// upload logo.png in src/assets/logos/ and 
export type TokenLogoMap = [Chain, string, string];
const tokenLogoMaps: TokenLogoMap[] = [
  [Chain.RAICOIN, '', 'raicoin.png'],
  [Chain.ETHEREUM, '', 'ethereum.png'],
  [Chain.ETHEREUM, '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 'wbtc.png'],
  [Chain.ETHEREUM, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'usdt.png'],
  [Chain.ETHEREUM, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'usdc.png'],
  [Chain.ETHEREUM, '0x4Fabb145d64652a948d72533023f6E7A623C7C53', 'busd.png'],
  [Chain.ETHEREUM, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 'dai.png'],
  [Chain.ETHEREUM, '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', 'shib.png'],
  [Chain.ETHEREUM, '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', 'uni.png'],
  [Chain.ETHEREUM, '0x2AF5D2aD76741191D15Dfe7bF6aC92d4Bd912Ca3', 'leo.png'],
  [Chain.ETHEREUM, '0x514910771AF9Ca656af840dff83E8264EcF986CA', 'link.png'],
  [Chain.ETHEREUM, '0x50D1c9771902476076eCFc8B2A83Ad6b9355a4c9', 'ftt.png'],
  [Chain.ETHEREUM, '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', 'matic.png'],
  [Chain.ETHEREUM, '0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b', 'cro.png'],
  [Chain.ETHEREUM, '0x5c147e74D63B1D31AA3Fd78Eb229B65161983B2b', 'wflow.png'],
  [Chain.ETHEREUM, '0x4d224452801ACEd8B2F0aebE155379bb5D594381', 'ape.png'],
  [Chain.ETHEREUM, '0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1', 'ton.png'],
  [Chain.ETHEREUM, '0x3506424F91fD33084466F402d5D97f05F8e3b4AF', 'chz.png'],
  [Chain.ETHEREUM, '0x4a220E6096B25EADb88358cb44068A3248254675', 'qnt.png'],
  [Chain.ETHEREUM, '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942', 'mana.png'],
  [Chain.ETHEREUM, '0x3845badAde8e6dFF049820680d1F14bD3903a5d0', 'sand.png'],
  [Chain.ETHEREUM, '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', 'aave.png'],
  [Chain.ETHEREUM, '0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b', 'axs.png'],
  [Chain.ETHEREUM, '0x0000000000085d4780B73119b644AE5ecd22b376', 'tusd.png'],
  [Chain.ETHEREUM, '0x8E870D67F660D95d5be530380D0eC0bd388289E1', 'usdp.png'],
  [Chain.ETHEREUM, '0x75231F58b43240C9718Dd58B4967c5114342a86c', 'okb.png'],
  [Chain.ETHEREUM, '0xC669928185DbCE49d2230CC9B0979BE6DC797957', 'btt.png'],
  [Chain.ETHEREUM, '0x6f259637dcD74C767781E37Bc6133cd6A68aa161', 'ht.png'],
  [Chain.ETHEREUM, '0x0C10bF8FcB7Bf5412187A595ab97a3609160b5c6', 'usdd.png'],
  [Chain.ETHEREUM, '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', 'mkr.png'],
  [Chain.ETHEREUM, '0xc944E90C64B2c07662A292be6244BDf05Cda44a7', 'grt.png'],
  [Chain.ETHEREUM, '0x674C6Ad92Fd080e4004b2312b45f796a192D27a0', 'usdn.png'],
  [Chain.ETHEREUM, '0x4E15361FD6b4BB609Fa63C81A2be19d873717870', 'ftm.png'],
  [Chain.ETHEREUM, '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', 'snx.png'],
  [Chain.ETHEREUM, '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', 'ldo.png'],
  [Chain.ETHEREUM, '0x45804880De22913dAFE09f4980848ECE6EcbAf78', 'paxg.png'],
  [Chain.ETHEREUM, '0xB62132e35a6c13ee1EE0f84dC5d40bad8d815206', 'nexo.png'],
  [Chain.ETHEREUM, '0xD533a949740bb3306d119CC777fa900bA034cd52', 'crv.png'],
  [Chain.ETHEREUM, '0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c', 'enj.png'],
  [Chain.ETHEREUM, '0x0D8775F648430679A709E98d2b0Cb6250d2887EF', 'bat.png'],
  [Chain.ETHEREUM, '0xE66747a101bFF2dBA3697199DCcE5b743b454759', 'gt.png'],
  [Chain.ETHEREUM, '0xc00e94Cb662C3520282E6f5717214004A7f26888', 'comp.png'],
  [Chain.ETHEREUM, '0x956F47F50A910163D8BF957Cf5846D573E7f87CA', 'fei.png'],
  [Chain.ETHEREUM, '0xe3c408BD53c31C085a1746AF401A4042954ff740', 'gmt.png'],
  [Chain.ETHEREUM, '0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD', 'lrc.png'],
  [Chain.ETHEREUM, '0x111111111117dC0aa78b770fA6A738034120C302', '1inch.png'],
  [Chain.ETHEREUM, '0x6c6EE5e31d828De241282B9606C8e98Ea48526E2', 'hot.png'],
  [Chain.ETHEREUM, '0xaaAEBE6Fe48E54f431b0C390CfaF0b017d09D42d', 'cel.png'],
  [Chain.ETHEREUM, '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', 'cvx.png'],
  [Chain.ETHEREUM, '0x6810e776880C02933D47DB1b9fc05908e5386b96', 'gno.png'],
  [Chain.ETHEREUM, '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e', 'yfi.png'],
  [Chain.ETHEREUM, '0x320623b8E4fF03373931769A31Fc52A4E78B5d70', 'rsr.png'],
  [Chain.ETHEREUM, '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', 'ens.png'],
  [Chain.ETHEREUM, '0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd', 'gusd.png'],
  [Chain.ETHEREUM, '0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA', 'gala.png'],
  [Chain.ETHEREUM, '0x8290333ceF9e6D528dD5618Fb97a76f268f3EDD4', 'ankr.png'],
  [Chain.ETHEREUM, '0x799ebfABE77a6E34311eeEe9825190B9ECe32824', 'btrst.png'],
  [Chain.ETHEREUM, '0x6fB3e0A217407EFFf7Ca062D46c26E5d60a14d69', 'iotx.png'],
  [Chain.ETHEREUM, '0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429', 'glm.png'],
  [Chain.ETHEREUM, '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07', 'omg.png'],
  [Chain.ETHEREUM, '0x720CD16b011b987Da3518fbf38c3071d4F0D1495', 'flux.png'],
  [Chain.ETHEREUM, '0xba100000625a3754423978a60c9317c58a424e3D', 'bal.png'],
  [Chain.ETHEREUM, '0x9992eC3cF6A55b00978cdDF2b27BC6882d88D1eC', 'poly.png'],
  [Chain.ETHEREUM, '0xE41d2489571d322189246DaFA5ebDe1F4699F498', 'zrx.png'],
  [Chain.ETHEREUM, '0x58b6A8A3302369DAEc383334672404Ee733aB239', 'lpt.png'],
  [Chain.ETHEREUM, '0xdeFA4e8a7bcBA345F687a2f1456F5Edd9CE97202', 'knc.png'],
  [Chain.ETHEREUM, '0xfF20817765cB7f73d4bde2e66e067E58D11095C2', 'amp.png'],
  [Chain.ETHEREUM, '0x476c5E26a75bd202a9683ffD34359C0CC15be0fF', 'srm.png'],
  [Chain.ETHEREUM, '0xB64ef51C888972c908CFacf59B47C1AfBC0Ab8aC', 'storj.png'],
  [Chain.ETHEREUM, '0x3C4B6E6e1eA3D4863700D7F76b36B7f3D3f13E3d', 'vgx.png'],
  [Chain.ETHEREUM, '0x18aAA7115705e8be94bfFEBDE57Af9BFc265B998', 'audio.png'],
  [Chain.ETHEREUM, '0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF', 'imx.png'],
  [Chain.ETHEREUM, '0x8CE9137d39326AD0cD6491fb5CC0CbA0e089b6A9', 'sxp.png'],
  [Chain.ETHEREUM, '0xba9d4199faB4f26eFE3551D490E3821486f135Ba', 'chsb.png'],
  [Chain.ETHEREUM, '0x5Ca381bBfb58f0092df149bD3D243b08B9a8386e', 'mxc.png'],
  [Chain.ETHEREUM, '0x4691937a7508860F876c9c0a2a617E7d9E945D4B', 'woo.png'],
  [Chain.ETHEREUM, '0xe83cE6bfb580583bd6A62B4Be7b34fC25F02910D', 'wabbc.png'],
  [Chain.ETHEREUM, '0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828', 'uma.png'],
  [Chain.ETHEREUM, '0x3a4f40631a4f906c2BaD353Ed06De7A5D3fCb430', 'pla.png'],
  [Chain.ETHEREUM, '0x00c83aeCC790e8a4453e5dD3B0B4b3680501a7A7', 'skl.png'],
  [Chain.ETHEREUM, '0xCC8Fa225D80b9c7D42F96e9570156c65D6cAAa25', 'slp.png'],
  [Chain.ETHEREUM, '0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3', 'elon.png'],
  [Chain.ETHEREUM, '0x198d14F2Ad9CE69E76ea330B374DE4957C3F850a', 'nft.png'],
  [Chain.ETHEREUM, '0x0f51bb10119727a7e5eA3538074fb341F56B09Ad', 'dao.png'],
  [Chain.ETHEREUM, '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2', 'sushi.png'],
  [Chain.ETHEREUM, '0x41e5560054824eA6B0732E656E3Ad64E20e94E45', 'cvc.png'],
  [Chain.ETHEREUM, '0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC', 'keep.png'],
  [Chain.ETHEREUM, '0x0FD10b9899882a6f2fcb5c371E17e70FdEe00C38', 'pundix.png'],
  [Chain.ETHEREUM, '0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30', 'inj.png'],
  [Chain.ETHEREUM, '0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24', 'rndr.png'],
  [Chain.ETHEREUM, '0xDDB3422497E61e13543BeA06989C0789117555c5', 'coti.png'],
  [Chain.ETHEREUM, '0x408e41876cCCDC0F92210600ef50372656052a38', 'ren.png'],
  [Chain.ETHEREUM, '0x7A58c0Be72BE218B41C608b7Fe7C5bB630736C71', 'people.png'],
  [Chain.ETHEREUM, '0xD13c7342e1ef687C5ad21b27c2b65D772cAb5C8c', 'uos.png'],
  [Chain.ETHEREUM, '0xFE3E6a25e6b192A42a44ecDDCd13796471735ACf', 'reef.png'],
  [Chain.ETHEREUM, '0x8C543AED163909142695f2d2aCd0D55791a9Edb9', 'vlx.png'],
  [Chain.ETHEREUM, '0x4F9254C83EB525f9FCf346490bbb3ed28a81C667', 'celr.png'],
  [Chain.ETHEREUM, '0x4fE83213D56308330EC302a8BD641f1d0113A4Cc', 'nu.png'],
  [Chain.ETHEREUM, '0x090185f2135308BaD17527004364eBcC2D37e5F6', 'spell.png'],
  [Chain.ETHEREUM, '0x8f8221aFbB33998d8584A2B05749bA73c37a938a', 'req.png'],
  [Chain.ETHEREUM, '0x8c15Ef5b4B21951d50E53E4fbdA8298FFAD25057', 'fx.png'],
  [Chain.ETHEREUM, '0xc7283b66Eb1EB5FB86327f08e1B5816b0720212B', 'tribe.png'],
  [Chain.ETHEREUM, '0xff56Cc6b1E6dEd347aA0B7676C85AB0B3D08B0FA', 'orbs.png'],
  [Chain.ETHEREUM, '0x744d70FDBE2Ba4CF95131626614a1763DF805B9E', 'snt.png'],
  [Chain.ETHEREUM, '0x967da4048cD07aB37855c090aAF366e4ce1b9F48', 'ocean.png'],
  [Chain.ETHEREUM, '0x607F4C5BB672230e8672085532f7e901544a7375', 'rlc.png'],
  [Chain.ETHEREUM, '0x11eeF04c884E24d9B7B4760e7476D06ddF797f36', 'mx.png'],
  [Chain.ETHEREUM, '0x595832F8FC6BF59c85C527fEC3740A1b7a361269', 'powr.png'],
  [Chain.ETHEREUM, '0x3597bfD533a99c9aa083587B074434E61Eb0A258', 'dent.png'],
  [Chain.ETHEREUM, '0x0b38210ea11411557c13457D4dA7dC6ea731B88a', 'api3.png'],
  [Chain.ETHEREUM, '0x55296f69f40Ea6d20E478533C15A6B08B654E758', 'xyo.png'],
  [Chain.ETHEREUM, '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C', 'bnt.png'],
  [Chain.ETHEREUM, '0x79C7EF95aD32DcD5ECadB231568Bb03dF7824815', 'arv.png'],
  [Chain.ETHEREUM, '0x888888848B652B3E3a0f34c96E00EEC0F3a23F72', 'tlm.png'],
  [Chain.ETHEREUM, '0x5CA42204cDaa70d5c773946e69dE942b85CA6706', 'posi.png'],
  [Chain.ETHEREUM, '0x389999216860AB8E0175387A0c90E5c52522C945', 'feg.png'],
  [Chain.ETHEREUM, '0xAE12C5930881c53715B369ceC7606B70d8EB229f', 'c98.png'],
  [Chain.ETHEREUM, '0x2F141Ce366a2462f02cEA3D12CF93E4DCa49e4Fd', 'free.png'],
  [Chain.ETHEREUM, '0xC17c30e98541188614dF99239cABD40280810cA3', 'rise.png'],
  [Chain.ETHEREUM, '0xAC51066d7bEC65Dc4589368da368b212745d63E8', 'alice.png'],
  [Chain.ETHEREUM, '0x43Dfc4159D86F3A37A5A4B3D4580b888ad7d4DDd', 'dodo.png'],
  [Chain.ETHEREUM, '0x84FA8f52E437Ac04107EC1768764B2b39287CB3e', 'gvr.png'],
  [Chain.ETHEREUM, '0x419D0d8BdD9aF5e606Ae2232ed285Aff190E711b', 'fun.png'],
  [Chain.ETHEREUM, '0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8', 'ageur.png'],
  [Chain.ETHEREUM, '0x9E32b13ce7f2E80A01932B42553652E053D6ed8e', 'metis.png'],
  [Chain.ETHEREUM, '0x037A54AaB062628C9Bbae1FDB1583c195585fe41', 'lcx.png'],
  [Chain.ETHEREUM, '0x662b67d00A13FAf93254714DD601F5Ed49Ef2F51', 'orc.png'],
  [Chain.ETHEREUM, '0x1EA48B9965bb5086F3b468E50ED93888a661fc17', 'mon.png'],
  [Chain.ETHEREUM, '0x0ab87046fBb341D058F17CBC4c1133F25a20a52f', 'gohm.png'],
  [Chain.ETHEREUM, '0x467719aD09025FcC6cF6F8311755809d45a5E5f3', 'axl.png'],
  [Chain.ETHEREUM, '0x853d955aCEf822Db058eb8505911ED77F175b99e', 'frax.png'],
  [Chain.ETHEREUM, '0xa23C1194d421F252b4e6D5edcc3205F7650a4eBE', 'lbp.png'],
  [Chain.ETHEREUM, '0x7Ddc52c4De30e94Be3A6A0A2b259b2850f421989', 'gmt2.png'],
  [Chain.ETHEREUM, '0x8355DBE8B0e275ABAd27eB843F3eaF3FC855e525', 'wool.png'],
  [Chain.ETHEREUM, '0x0d438F3b5175Bebc262bF23753C1E53d03432bDE', 'wnxm.png'],
  [Chain.ETHEREUM, '0x7D29A64504629172a429e64183D6673b9dAcbFCe', 'vxv.png'],
  [Chain.ETHEREUM, '0xC08512927D12348F6620a698105e1BAac6EcD911', 'gyen.png'],
  [Chain.ETHEREUM, '0x24E89bDf2f65326b94E36978A7EDeAc63623DAFA', 'tking.png'],
  [Chain.ETHEREUM, '0x7420B4b9a0110cdC71fB720908340C03F9Bc03EC', 'jasmy.png'],
  [Chain.ETHEREUM, '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0', 'fxs.png'],
  [Chain.ETHEREUM, '0xB4272071eCAdd69d933AdcD19cA99fe80664fc08', 'xchf.png'],
  [Chain.ETHEREUM, '0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44', 'kp3r.png'],
  [Chain.ETHEREUM, '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2', 'swise.png'],
  [Chain.ETHEREUM, '0xeD35af169aF46a02eE13b9d79Eb57d6D68C1749e', 'omi.png'],


  
  /* Ethereum end */

  /* BSC begin */
  [Chain.BINANCE_SMART_CHAIN, '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', 'btcb.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x55d398326f99059fF775485246999027B3197955', 'usdt.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', 'ethereum.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', 'usdc.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', 'busd.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', 'dai.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', 'cake.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x965F527D9159dCe6288a2219DB51fc6Eef120dD1', 'bsw.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x2859e4544C4bB03966803b044A93563Bd2D0DD4D', 'shib.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x383094a91Ef2767Eed2B063ea40465670bf1C83f', 'lmcswap.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', 'xrp.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', 'doge.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xd32d01A43c869EdcD1117C640fBDcfCFD97d9d65', 'nmx.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xc748673057861a797275CD8A068AbB95A902e8de', 'babydoge.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x3019BF2a2eF8040C242C9a4c5c4BD4C81678b2A1', 'gmt.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47', 'ada.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x4B0F1812e5Df2A09796481Ff14017e6005508003', 'twt.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xCC42724C6683B7E57334c4E856f4c9965ED682bD', 'matic.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95', 'banana.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402', 'dot.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x9131066022B909C65eDD1aaf7fF213dACF4E86d0', 'land.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x4e3cABD3AD77420FF9031d19899594041C420aeE', 'titano.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x6679eB24F59dFe111864AEc72B443d1Da666B360', 'arv.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD', 'link.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x1CE0c2827e2eF14D5C4f29a091d735A204794041', 'avax.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x42981d0bfbAf196529376EE702F2a9Eb9092fcB5', 'sfm.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x154A9F9cbd3449AD22FDaE23044319D6eF2a1Fab', 'skill.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x2222227E22102Fe3322098e4CBfE18cFebD57c95', 'tlm.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F', 'alpaca.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63', 'xvs.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xD41FDb03Ba84762dD66a0af1a6C8540FF1ba5dfb', 'sfp.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94', 'ltc.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xd983AB71a284d6371908420d8Ac6407ca943F810', 'ulx.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x0Eb3a705fc54725037CC9e008bDede697f62F335', 'atom.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xfb5B838b6cfEEdC2873aB27866079AC55363D37E', 'floki.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xb465f3cb6Aba6eE375E12918387DE1eaC2301B05', 'trivia.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1', 'uni.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xacFC95585D80Ab62f67A14C566C1b7a49Fe91167', 'feg.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x2AA504586d6CaB3C59Fa629f74c586d78b93A025', 'apc.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x7dDEE176F665cD201F93eEDE625770E2fD911990', 'gala.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xAD29AbB318791D579433D831ed122aFeAf29dcfe', 'ftm.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x9C65AB58d8d978DB963e63f2bfB7121627e3a739', 'mdx.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x3d6545b08693daE087E957cb1180ee38B9e3c25E', 'etc.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x8A5d7FCD4c90421d21d30fCC4435948aC3618B2f', 'monsta.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xf307910A4c7bbc79691fD374889b36d8531B08e3', 'ankr.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x1Fa4a73a3F0133f0025378af00236f3aBDEE5D63', 'near.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xF21768cCBC73Ea5B6fd3C687208a7c2def2d966e', 'reef.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6', 'eos.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xd9025e25Bb6cF39f8c926A704039D2DD51088063', 'cyt.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xb86AbCb37C3A4B64f74f59301AFF131a1BEcC787', 'zil.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x111111111117dC0aa78b770fA6A738034120C302', '1inch.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xaEC945e04baF28b135Fa7c640f624f8D90F1C3a6', 'c98.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x352Cb5E19b12FC216548a2677bD0fce83BaE434B', 'btt.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xA64455a4553C9034236734FadDAddbb64aCE4Cc7', 'santos.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xA58950F05FeA2277d2608748412bf9F802eA4901', 'wsg.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x12e34cDf6A031a10FE241864c32fB03a4FDaD739', 'free.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5', 'bake.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x4C882ec256823eE773B25b414d36F92ef58a7c0C', 'pstake.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xC17c30e98541188614dF99239cABD40280810cA3', 'rise.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x20D39a5130F799b95B55a930E5b7eBC589eA9Ed8', 'he.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x715D400F88C167884bbCc41C5FeA407ed4D2f8A0', 'axs.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x606FB7969fC1b5CAd58e64b12Cf827FB65eE4875', 'okse.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xAC51066d7bEC65Dc4589368da368b212745d63E8', 'alice.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf', 'bch.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xfe56d5892BDffC7BF58f2E84BE1b2C32D21C308b', 'knc.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xAe9269f27437f0fcBC232d39Ec814844a51d6b8f', 'burger.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xCa3F508B8e4Dd382eE878A314789373D80A5190A', 'bifi.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x67ee3Cb086F8a16f34beE3ca72FAD36F7Db929e2', 'dodo.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xaFb64E73dEf6fAa8B6Ef9a6fb7312d5C4C15ebDB', 'gvr.png'],
  [Chain.BINANCE_SMART_CHAIN, '0xe552Fb52a4F19e44ef5A967632DBc320B0820639', 'metis.png'],
  [Chain.BINANCE_SMART_CHAIN, '0x7Ddc52c4De30e94Be3A6A0A2b259b2850f421989', 'gmt2.png'],


  /* BSC end */

  /* testnet */
  [Chain.RAICOIN_TEST, '', 'raicoin.png'],
  [Chain.RAICOIN_TEST, 'rai_3uejbias6jjryyh6uqydfjxyce1uqk8b666hazu9tb6owjg6b363hhwifiuz', 'bitcoin.png'],
  [Chain.RAICOIN_TEST, 'rai_1taim3p6qd1no7tdtnmhq15kifhg51p5yg45pi9i7wsiozmwugbfq8wh747h', 'ethereum.png'],
  [Chain.RAICOIN_TEST, 'rai_38ssase4ppphh4qio8bucsuobp5khgmm6zig5fm9rx46okrfk1h3azip3pjr', 'usdt.png'],
  [Chain.RAICOIN_TEST, 'rai_1timaah5teuxjjqeu43qby9k3jruyrjp8t8b4jh7z6bkud59g3eyb58oeejh', 'ens.png'],
  /* Raicoin Testnet End */

  [Chain.BINANCE_SMART_CHAIN_TEST, '', 'binance-coin.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8', 'bitcoin.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0xd66c6B4F0be8CE5b39D52E0Fd1344c389929B378', 'ethereum.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', 'usdt.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867', 'dai.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee', 'busd.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0x64544969ed7EBf5f083679233325356EbE738930', 'usdc.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0xa83575490D7df4E2F47b7D38ef351a2722cA45b9', 'xrp.png'],
  [Chain.BINANCE_SMART_CHAIN_TEST, '0x259BECb3C69290b3F9Ff35BBD063fae36580EFE6', 'oat.webp'],


  [Chain.ETHEREUM_TEST_GOERLI, '', 'ethereum.png'],
  [Chain.ETHEREUM_TEST_GOERLI, '0x07865c6E87B9F70255377e024ace6630C1Eaa37F', 'usdc.png'],
  [Chain.ETHEREUM_TEST_GOERLI, '0x162d69731650cfdac48bffebF2fa8FCd50AC0Db9', 'bayc.webp'],
]
