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
]

// upload logo.png in src/assets/logos/ and 
export type TokenLogoMap = [Chain, string, string];
const tokenLogoMaps: TokenLogoMap[] = [
  [Chain.RAICOIN, '', 'raicoin.png'],
  [Chain.ETHEREUM, '', 'ethereum.png'],

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
]
