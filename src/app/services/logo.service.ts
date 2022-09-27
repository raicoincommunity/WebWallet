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

  [Chain.ETHEREUM_TEST_GOERLI, '', 'ethereum.png'],
]
