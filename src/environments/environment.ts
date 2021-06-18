// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  default_servers: ['server.beta.raiwallet.org'],
  default_representatives: [
    'rai_1jngsd4mnzfb4h5j8eji5ynqbigaz16dmjjdz8us6run1ziyzuqfhz8yz3uf',
    'rai_1936xw8zcxzsqx1rr97xwajigtdtsws45gatwu1ztt658gnpw1s1ttcwu11b',
    'rai_36bu4g1tegdbwwqnec4otqncqkjzyn5134skna4i8gexhx11eeawry4akjhu',
    'rai_14k51wrdhpfyf3ikh811pedndjof6fffziokwymapwjbk8obrztmawsw9bnm',
  ],
  epoch_timestamp: 1585699200,
  bsc_network: 'binance-testnet',
  bsc_chain_id: 97,
  rpc_options: {
    //1: 'https://mainnet.infura.io/v3/b06ff656dd6349909e805f50ff2d8250',
    97: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  },
  bsc_contract_address: '0xDF4c22DD5a4D12C7d4EeE5064B09e1A31EC552AB',
  bsc_bridge_address: 'rai_3wacx85yoau7hejaiu1xyfzof6btdcwnx68nyn6ei7ocrcbr4ptabu169t8m',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
