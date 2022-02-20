import { Injectable } from '@angular/core';
import { Chain, ChainHelper } from './util.service'

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

  [Chain.RAICOIN_TEST, 'raicoin.png'],
]

// upload logo.png in src/assets/logos/ and 
type TokenLogoMap = [Chain, string, string];
const tokenLogoMaps: TokenLogoMap[] = [
  [Chain.RAICOIN, '', 'raicoin.png'],
  [Chain.ETHEREUM, '', 'ethereum.png'],

  [Chain.RAICOIN_TEST, '', 'raicoin.png'],
  [Chain.RAICOIN_TEST, 'rai_3uejbias6jjryyh6uqydfjxyce1uqk8b666hazu9tb6owjg6b363hhwifiuz', 'bitcoin.png'],
]
