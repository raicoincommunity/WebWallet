import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { U128, U64, U256, Chain, ChainStr, ChainHelper, ZX, TokenType, TokenTypeStr } from './util.service';
import { Web3Service } from './web3.service';
import { TypedDataUtils, TypedMessage, MessageTypes, SignTypedDataVersion,
  recoverTypedSignature } from '@metamask/eth-sig-util';
import { UnmapInfo, WrapInfo } from './token.service';

@Injectable({
  providedIn: 'root'
})
export class ValidatorService implements OnDestroy {
  private SERVICE = 'validator';
  private MIN_PERCENT = 51;
  private chains: { [chain: number]: CrossChainInfo } = {};
  private transfers: { [account: string]: { [height: number] : TransferSignatures } } = {};
  private creations: { [originalChainContract: string]: { [targetChain: string] : CreationSignatures } } = {};
  private timerSync: any = null;

  constructor(
    private server: ServerService
  ) {
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.timerSync = setInterval(() => this.ongoingSync(), 3000);
  }

  ngOnDestroy() {
    if (this.timerSync) {
      clearInterval(this.timerSync);
      this.timerSync = null;
    }
  }

  addChain(chainStr: ChainStr) {
    const chain = ChainHelper.toChain(chainStr);
    if (chain === Chain.INVALID) return;
    let info = this.chains[chain];
    if (info) return;
    info = new CrossChainInfo();
    info.chainStr = chainStr;
    this.chains[chain] = info;
    this.ongoingSync();
  }

  syncChainHeadHeight(chainStr: ChainStr) {
    this.addChain(chainStr);
    this.queryChainHeadHeight(chainStr);
  }

  chainInfo(chainStr: ChainStr): CrossChainInfo | undefined {
    const chain = ChainHelper.toChain(chainStr);
    if (chain === Chain.INVALID) return undefined;
    const info = this.chains[chain];
    if (!info || !info.valid) return undefined;
    return info;
  }

  signing(account: string, height: number): boolean {
    return !!(this.transfers[account]?.[height]);
  }

  signingCreation(originalChain: string, originalContract: string, targetChain: string): boolean {
    const originalChainContract = `${originalChain}_${originalContract}`;
    return !!(this.creations[originalChainContract]?.[targetChain]);
  }

  signedPercent(account: string, height: number): number {
    const transfer = this.transfers[account]?.[height];
    if (!transfer) return 0;
    const info = this.chains[transfer.chain];
    if (!info) return 0;
    return transfer.percent(info.totalWeight, info.validators);
  }

  creationSignedPercent(
    originalChain: string,
    originalContract: string,
    targetChain: string
  ): number {
    const originalChainContract = `${originalChain}_${originalContract}`;
    const creation = this.creations[originalChainContract]?.[targetChain];
    if (!creation) return 0;
    const chain = ChainHelper.toChain(targetChain);
    const info = this.chains[chain];
    if (!info) return 0;
    return creation.percent(info.totalWeight, info.validators);
  }

  transferSignatures(account: string, height: number, percent: number): string {
    const transfer = this.transfers[account]?.[height];
    if (!transfer) return '';
    const info = this.chains[transfer.chain];
    if (!info) return '';
    const validators = transfer.top(percent, info.totalWeight, info.sortedValidators);
    if (validators.length === 0) return '';
    validators.sort((x, y) => {
      if (x.signer < y.signer) return -1;
      if (x.signer > y.signer) return 1;
      return 0
    });
    let result = '';
    for (let i of validators) {
      if (!transfer.signatures[i.validator]) return '';
      result += transfer.signatures[i.validator].signature.substring(2);
    }
    return result;
  }

  creationSigatures(
    originalChain: string,
    originalContract: string,
    chain: string | number,
    percent: number
  ): string {
    const originalChainContract = `${originalChain}_${originalContract}`;
    const creation = this.creations[originalChainContract]?.[chain];
    if (!creation) return '';
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain)
    }
    const info = this.chains[chain];
    if (!info) return '';
    const validators = creation.top(percent, info.totalWeight, info.sortedValidators);
    if (validators.length === 0) return '';
    validators.sort((x, y) => {
      if (x.signer < y.signer) return -1;
      if (x.signer > y.signer) return 1;
      return 0
    });
    let result = '';
    for (let i of validators) {
      if (!creation.signatures[i.validator]) return '';
      result += creation.signatures[i.validator].signature.substring(2);
    }
    return result;
  }

  creationParameters(
    originalChain: string,
    originalContract: string,
    chain: string | number,
  ): CreationParameters | undefined {
    const originalChainContract = `${originalChain}_${originalContract}`;
    return this.creations[originalChainContract]?.[chain]?.params;
  }

  signUnmap(unmap: UnmapInfo) {
    const account = unmap.account;
    const height = unmap.height;
    if (this.transfers[account]?.[height]) return;
    if (!this.transfers[account]) {
      this.transfers[account] = {};
    }
    const transfer = new TransferSignatures(CrossChainOp.UNMAP, unmap.chainId as Chain, unmap);
    this.transfers[account][height] = transfer;
    this.syncTransferSignatures(transfer);
  }

  signWrap(wrap: WrapInfo) {
    const account = wrap.account;
    const height = wrap.height;
    if (this.transfers[account]?.[height]) return;
    if (!this.transfers[account]) {
      this.transfers[account] = {};
    }
    const transfer = new TransferSignatures(CrossChainOp.WRAP, wrap.toChainId as Chain, wrap);
    this.transfers[account][height] = transfer;
    this.syncTransferSignatures(transfer);
  }

  signCreation(
    originalChain: string,
    originalContract: string,
    targetChain: string,
    type: string,
    decimals: number
  ) {
    const originalChainContract = `${originalChain}_${originalContract}`;
    if (this.creations[originalChainContract]?.[targetChain]) return;
    if (!this.creations[originalChainContract]) {
      this.creations[originalChainContract] = {};
    }
    const creation = new CreationSignatures(originalChain, originalContract, targetChain,
      type, decimals);
    creation.params = this.findCreationParameters(originalChain, originalContract);
    this.creations[originalChainContract][targetChain] = creation;
    this.syncCreationSignatures(creation, true);
  }

  private processServerState(state: ServerState) {
    if (state === ServerState.CONNECTED) {
      this.ongoingSync(true);
    }
    else {
    }
  }

  private ongoingSync(force?: boolean) {
    if (this.server.getState() !== ServerState.CONNECTED) return;
    const now = window.performance.now();

    for (let chain in this.chains) {
      const info = this.chains[chain];
      if (!force && info.nextSyncAt > now) continue;
      this.subscribe(+chain);
      this.queryChainInfo(+chain);
      info.nextSyncAt = now + 20000;
    }

    for (let account in this.transfers) {
      for (let height in this.transfers[account]) {
        this.syncTransferSignatures(this.transfers[account][height]);
      }
    }

    for (let i in this.creations) {
      for (let j in this.creations[i]) {
        this.syncCreationSignatures(this.creations[i][j]);
      }
    }

  }

  private subscribe(chain: number | string) {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{ key: 'chain_id', value: `${chain}` }],
      request_id: `chain:${chain}`
    };
    this.server.send(message);
  }

  private findCreationParameters(originalChain: string, originalContract: string) {
    const originalChainContract = `${originalChain}_${originalContract}`;
    const creations = this.creations[originalChainContract];
    if (!creations) return undefined;
    for (let i in creations) {
      if (creations[i].params) {
        return creations[i].params;
      }
    }
    return undefined;
  }

  queryChainInfo(chain: number | string) {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const message: any = {
      action: 'chain_info',
      service: this.SERVICE,
      chain_id: `${chain}`,
    };
    this.server.send(message);
  }

  private queryChainHeadHeight(chain: number | string) {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const message: any = {
      action: 'chain_head_height',
      service: this.SERVICE,
      chain_id: `${chain}`,
    };
    this.server.send(message);
  }

  private syncTransferSignatures(transfer: TransferSignatures) {
    const now = window.performance.now();
    if (now < transfer.lastQueryAt + transfer.round * 3000) return;
    const info = this.chains[transfer.chain];
    if (!info || !info.valid) return;

    let percent = transfer.percent(info.totalWeight, info.validators);
    if (percent > this.MIN_PERCENT) return;

    percent = this.roundToPercent(transfer.round);
    const weight = info.topWeight(percent);
    for (let i of info.sortedValidators) {
      if (transfer.signatures[i.validator]) continue;
      if (i.weight.lt(weight) || i.weight.eq(0)) break;
      this.requestSignTransfer(transfer.chain, transfer.account, transfer.height,
        i.validator, transfer.op);
    }

    transfer.round++;
    transfer.lastQueryAt = now;
  }

  private requestSignTransfer(chain: number | string, account: string, height: number,
    validator: string, op: CrossChainOp) {
      if (typeof chain === 'string') {
        chain = ChainHelper.toChain(chain);
      }
      const message: any = {
      action: 'sign_transfer',
      service: this.SERVICE,
      chain_id: `${chain}`,
      account,
      height: `${height}`,
      validator,
      operation: op,
    };
    this.server.send(message);
  }

  private syncCreationSignatures(creation: CreationSignatures, force: boolean = false) {
    const now = window.performance.now();
    if (!force && now < creation.lastQueryAt + creation.round * 3000) return;
    
    if (!creation.params) {
      this.queryCreationParameters(creation.originalChain, creation.originalContract)
    } else {
      const chain = ChainHelper.toChain(creation.targetChain);
      const info = this.chains[chain];
      if (!info || !info.valid) return;
  
      let percent = creation.percent(info.totalWeight, info.validators);
      if (percent > this.MIN_PERCENT) return;
  
      percent = this.roundToPercent(creation.round);
      const weight = info.topWeight(percent);
      for (let i of info.sortedValidators) {
        if (creation.signatures[i.validator]) continue;
        if (i.weight.lt(weight) || i.weight.eq(0)) break;
        this.requestSignCreation(creation.originalChain, creation.originalContract,
          creation.targetChain, i.validator);
      }
    }

    creation.round++;
    creation.lastQueryAt = now;
  }

  private queryCreationParameters(chain: number | string, address_raw: string) {
      if (typeof chain === 'string') {
        chain = ChainHelper.toChain(chain);
      }

      const ret = ChainHelper.rawToAddress(chain, address_raw);
      if (ret.error) {
        return;
      }

      const message: any = {
      action: 'creation_parameters',
      service: this.SERVICE,
      chain_id: `${chain}`,
      address: ret.address,
      address_raw,
    };
    this.server.send(message);
  }

  private requestSignCreation(
    originalChain: string | number,
    originalContract: string,
    targetChain: string | number,
    validator: string
  ) {
    if (typeof targetChain === 'string') {
      targetChain = ChainHelper.toChain(targetChain);
    }
    if (typeof originalChain === 'string') {
      originalChain = ChainHelper.toChain(originalChain);
    }
    const message: any = {
      action: 'sign_creation',
      service: this.SERVICE,
      chain_id: `${targetChain}`,
      original_chain_id: `${originalChain}`,
      original_contract: originalContract,
      validator
    };
    this.server.send(message);
  }

  private processMessage(message: any) {
    if (!message.service || message.service !== this.SERVICE) return;

    if (message.ack) {
      switch (message.ack) {
        case 'service_subscribe':
          this.processServiceSubscribe(message);
          break;
        case 'chain_info':
          this.processChainInfo(message);
          break;
        case 'chain_head_height':
          this.processChainHeadHeight(message);
          break;
        case 'creation_parameters':
          this.processCreationParameters(message);
          break;
        case 'sign_creation':
          this.processSignCreation(message);
          break;
        case 'sign_transfer':
          this.processSignTransfer(message);
          break
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'chain_info':
          this.processChainInfo(message);
          break;
        default:
          break;
        }
    }
  }

  private processServiceSubscribe(message: any) {
    if (!message.request_id) {
      console.log('processServiceSubscribeAck: request_id missing');
      return;
    }

    const id = message.request_id;
    if (id.startsWith('chain:')) {
      const chain = +id.substring(6);
      const info = this.chains[chain];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    }
  }

  private processChainInfo(message: any) {
    if (message.error || !message.chain_id) return;
    const chain = +message.chain_id;
    const info = this.chains[chain];
    if (!info) return;
    const error = info.fromJson(message);
    if (error)
    {
      console.error('processChainInfo: parse message failed', message);
      return;
    }
    info.updateNextSyncAt();
    for (let account in this.transfers) {
      for (let height in this.transfers[account]) {
        const transfer = this.transfers[account][height];
        if (chain as Chain === transfer.chain) {
          transfer.clearPercentCache();
        }
      }
    }
  }

  private processChainHeadHeight(message: any) {
    if (message.error || !message.chain_id) return;
    const chain = +message.chain_id;
    const info = this.chains[chain];
    if (!info) return;
    info.height = +message.height;
  }

  private processCreationParameters(message: any) {
    if (message.error || !message.chain_id || !message.address_raw) return;

    const params = new CreationParameters();
    const error = params.fromJson(message);
    if (error) return;

    const chain = ChainHelper.toChainStr(+message.chain_id);
    const originalChainContract = `${chain}_${message.address_raw.toLowerCase()}`;
    const creations = this.creations[originalChainContract];
    if (!creations) return;
    for (let i in creations) {
      const creation = creations[i];
      if (!creation.params) {
        creation.params = params;
        creation.round = 0;
        this.syncCreationSignatures(creation, true);
      }
    }
  }

  private processSignCreation(message: any) {
    if (message.error || message.pending || !message.signature) return;
    const sig = new CrossChainSignature();
    let error = sig.fromJson(message);
    if (error) {
      console.error(`ValidatorService::processSignCreation: failed to make CrossChainSignature, message=`, message);
      return;
    }
    const originalChain = ChainHelper.toChainStr(+message.original_chain_id);
    const originalContract = message.original_contract;
    const originalChainContract = `${originalChain}_${originalContract}`;
    const targetChain = message.chain;

    if (!this.creations[originalChainContract]?.[targetChain]) return;
    const creation = this.creations[originalChainContract][targetChain];

    error = this.verifyCreationSignature(creation, sig);
    if (error) return;

    creation.signatures[sig.validator] = sig;
    creation.clearPercentCache();
  }

  private processSignTransfer(message: any) {
    if (message.error || message.pending || !message.signature) return;
    const sig = new CrossChainSignature();
    let error = sig.fromJson(message);
    if (error) {
      console.error(`ValidatorService::processSignTransfer: failed to make CrossChainSignature, message=`, message);
      return;
    }
    const account = message.account;
    const height = +message.height;
    if (!this.transfers[account]?.[height]) return;
    const transfer = this.transfers[account][height];

    error = this.verifyTransferSignature(transfer, sig);
    if (error) return;

    transfer.signatures[sig.validator] = sig;
    transfer.clearPercentCache();
  }

  private roundToPercent(round: number) {
    if (round < 3) {
      return 55;
    } else if (round < 6) {
      return 75;
    } else if (round < 9) {
      return 95;
    } else {
      return 99;
    }
  }

  private verifyTransferSignature(transfer: TransferSignatures, sig: CrossChainSignature): boolean {
    const chainInfo = this.chains[transfer.chain];
    if (!chainInfo) return true;
    const validatorInfo = chainInfo.validators[sig.validator];
    if (!validatorInfo) return true;
    if (sig.signer !== validatorInfo.signer) return true;

    if (ChainHelper.isEvmChain(transfer.chain)) {
      return this.verifyEvmTransferSignature(transfer, sig);
    } else {
      console.error(`ValidatorService::verifyTransferSignature: unsupported chain=${transfer.chain}`);
      return true;
    }
  }

  private verifyEvmTransferSignature(transfer: TransferSignatures, sig: CrossChainSignature): boolean {
    const chain = ChainHelper.toChainStr(transfer.chain);
    const ret = ChainHelper.rawToAddress(chain, sig.signer);
    if (ret.error || !ret.address) {
      console.error(`ValidatorService::verifyEvmTransferSignature: invalid signer=`, sig.signer);
      return true;
    }
    const signer = ret.address.toLowerCase();

    if (transfer.op === CrossChainOp.UNMAP) {
      const data = transfer.data as UnmapInfo;
      const sender = data.fromRaw.to0xHex();
      const recipient = data.to;
      const hash = ZX + data.sourceTxn.toLowerCase();
      const height = `${data.height}`;
      const value = data.value.to0xHex();
      const token = data.address;
      let typedMessage: any;
      if (ChainHelper.isNative(data.chain, data.addressRaw)) {
        typedMessage = EIP712.unmapETH(chain, sender, recipient, hash, height, value);
      }
      else if (data.type === TokenType._20) {
        typedMessage = EIP712.unmapERC20(chain, token, sender, recipient, hash, height, value);
      } else if (data.type === TokenType._721) {
        typedMessage = EIP712.unmapERC721(chain, token, sender, recipient, hash, height, value);
      } else {
        console.error(`ValidatorService::verifyTransferSignature: unknow token type=${data.type}`);
        return true;
      }
      const recovered = recoverTypedSignature({ 
        signature: sig.signature, 
        version: SignTypedDataVersion.V4,
        data: typedMessage });
      return recovered.toLowerCase() !== signer;
    } else if (transfer.op === CrossChainOp.WRAP) {
      const data = transfer.data as WrapInfo;
      const originalChainId = `${data.chainId}`;
      const originalContract = data.addressRaw.to0xHex();
      const sender = data.fromRaw.to0xHex();
      const recipient = data.toAccountRaw.to0xHex();
      const hash = ZX + data.sourceTxn.toLowerCase();
      const height = `${data.height}`;
      const value = data.value.to0xHex();
      let typedMessage: any;
      if (data.type === TokenType._20) {
        typedMessage = EIP712.wrapERC20Token(chain, originalChainId, originalContract, sender,
          recipient, hash, height, value);
      } else if (data.type === TokenType._721) {
        typedMessage = EIP712.wrapERC721Token(chain, originalChainId, originalContract, sender,
          recipient, hash, height, value);
      } else {
        console.error(`ValidatorService::verifyTransferSignature: unknow token type=${data.type}`);
        return true;
      }
      const recovered = recoverTypedSignature({ 
        signature: sig.signature, 
        version: SignTypedDataVersion.V4,
        data: typedMessage });
      return recovered.toLowerCase() !== signer;
    }
    else {
      console.error(`ValidatorService::verifyTransferSignature: unknow op=${transfer.op}`);
      return true;
    }
  }

  private verifyCreationSignature(creation: CreationSignatures, sig: CrossChainSignature): boolean {
    const chain = ChainHelper.toChain(creation.targetChain);
    const chainInfo = this.chains[chain];
    if (!chainInfo) return true;
    const validatorInfo = chainInfo.validators[sig.validator];
    if (!validatorInfo) return true;
    if (sig.signer !== validatorInfo.signer) return true;

    if (ChainHelper.isEvmChain(chain)) {
      return this.verifyEvmCreationSignature(creation, sig);
    } else {
      console.error(`ValidatorService::verifyCreationSignature: unsupported chain=${chain}`);
      return true;
    }
  }

  private verifyEvmCreationSignature(
    creation: CreationSignatures,
    sig: CrossChainSignature
  ): boolean {
    const chain = creation.targetChain;
    const ret = ChainHelper.rawToAddress(chain, sig.signer);
    if (ret.error || !ret.address) {
      console.error(`ValidatorService::verifyEvmCreationSignature: invalid signer=`, sig.signer);
      return true;
    }
    const signer = ret.address.toLowerCase();

    const name = creation.params!.name;
    const symbol = creation.params!.symbol;
    const originalChain = creation.originalChain;
    const originalChainId = `${ChainHelper.toChain(originalChain)}`;
    const originalContract = creation.originalContract;
    const decimals = `${creation.decimals}`;

    let typedMessage: any;
    if (creation.type == TokenTypeStr._20) {
      typedMessage = EIP712.createWrappedERC20Token(
        chain, name, symbol, originalChain, originalChainId, originalContract, decimals);
    } else if (creation.type == TokenTypeStr._721) {
      typedMessage = EIP712.createWrappedERC721Token(
        chain, name, symbol, originalChain, originalChainId, originalContract);
    } else {
      console.error(`ValidatorService::verifyEvmCreationSignature: unknow type=${creation.type}`);
      return true;
    }

    const recovered = recoverTypedSignature({ 
      signature: sig.signature, 
      version: SignTypedDataVersion.V4,
      data: typedMessage });
    return recovered.toLowerCase() !== signer;
  }

}

class CrossChainValidator {
  validator: string = '';
  validatorAccount: string = '';
  signer: string = '';
  weight: U256 = U256.zero();
  gasPrice: U256 = U256.zero();
  lastSubmit: number = 0;
  epoch: number = 0;

  fromJson(json: any): boolean {
    try {
      this.validator = json.validator;
      const raw = new U256(this.validator, 16);
      this.validatorAccount = raw.toAccountAddress();
      this.signer = json.signer;
      this.weight = new U256(json.weight);
      if (json.gas_price) {
        this.gasPrice = new U256(json.gas_price);
      }
      if (json.last_submit) {
        this.lastSubmit = +json.last_submit;
      }
      if (json.epoch) {
        this.epoch = +json.epoch;
      }
      return false;
    }
    catch (e) {
      console.log(`CrossChainValidator.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

type CrossChainValidators = { [validator: string]: CrossChainValidator };
export class CrossChainInfo {
  chain: Chain = Chain.INVALID;
  confirmations: number = 0;
  fee: U256 = U256.zero();
  feeRoundUp: U256 = U256.zero();
  height: number = 0;
  valid: boolean = false;
  totalWeight: U256 = U256.zero();
  genesisValidator: CrossChainValidator = new CrossChainValidator();
  validators: CrossChainValidators = {};
  sortedValidators: CrossChainValidator[] = [];

  // local data
  chainStr: ChainStr = ChainStr.INVALID;
  subscribed: boolean = false;
  nextSyncAt: number = 0;
  topWeightCaches: { [percent: number]: U256} = {};

  fromJson(json: any): boolean {
    try {
      this.valid = false;
      this.chain = +json.chain_id;
      this.confirmations = +json.confirmations;
      this.fee = new U256(json.fee);
      this.feeRoundUp = this.fee.roundUp(3);
      this.height = +json.height;
      this.totalWeight = new U256(json.total_weight);
      this.genesisValidator.validator = json.genesis_validator;
      const raw = new U256(this.genesisValidator.validator, 16);
      this.genesisValidator.validatorAccount = raw.toAccountAddress();
      this.genesisValidator.signer = json.genesis_signer;
      this.genesisValidator.weight = new U256(json.genesis_weight);

      this.validators = {};
      this.sortedValidators = [];
      this.validators[this.genesisValidator.validator] = this.genesisValidator;
      this.sortedValidators.push(this.genesisValidator);
      if (json.validators) {
        for (let i of json.validators) {
          const validator = new CrossChainValidator();
          const error = validator.fromJson(i);
          if (error) return true;
          this.validators[validator.validator] = validator;
          this.sortedValidators.push(validator);
        }
        this.sortedValidators.sort((x, y) => {
          if (x.weight.gt(y.weight)) return -1;
          if (y.weight.gt(x.weight)) return 1;
          return 0;
        });
      }
      this.topWeightCaches = {};
      this.valid = true;
      return false;
    }
    catch (e) {
      console.log(`CrossChainInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  updateNextSyncAt() {
    const now = window.performance.now();
    if (this.subscribed && this.valid) {
      this.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
    } else {
      this.nextSyncAt = now + 5000;
    }
  }

  topWeight(percent: number): U256 {
    if (this.totalWeight.eq(0)) return U256.max();
    if (this.topWeightCaches[percent]) {
      this.topWeightCaches[percent];
    }

    let sum = U256.zero();
    let threshold = this.totalWeight.mul(percent).idiv(100);
    for (let i of this.sortedValidators) {
      sum = sum.plus(i.weight);
      if (sum.gt(threshold)) {
        this.topWeightCaches[percent] = i.weight;
        return i.weight;
      }
    }
    this.topWeightCaches[percent] = U256.zero();
    return U256.zero();
  }

}

export enum CrossChainOp {
  NONE = '',
  MAP = 'map',
  UNMAP = 'unmap',
  WRAP = 'wrap',
  UNWRAP = 'unwrap',
}

class CrossChainSignature {
  validator: string = '';
  signer: string = '';
  signature: string = '';

  fromJson(json: any): boolean {
    this.validator = json.validator;
    this.signer = json.signer;
    this.signature = json.signature;
    return !(this.validator && this.signer && this.signature);
  }
}

type TransferSignatureData = UnmapInfo | WrapInfo;

class TransferSignatures {
  op: CrossChainOp = CrossChainOp.NONE;
  account: string = '';
  height: number = 0;
  chain: Chain = Chain.INVALID;
  data?: TransferSignatureData;
  signatures: { [validator: string]: CrossChainSignature } = {};
  percentCache?: number;
  round: number = 0;
  lastQueryAt: number = 0;

  constructor(op: CrossChainOp, chain: Chain, data: TransferSignatureData) {
    this.op = op;
    this.account = data.account;
    this.height = data.height;
    this.chain = chain;
    this.data = data;
  }

  percent(total: U256, validators: CrossChainValidators): number {
    if (this.percentCache !== undefined) {
      return this.percentCache;
    }

    if (total.eq(0)) {
      return 0;
    }

    let sum = new U256(0);
    for (let i in this.signatures) {
      if (!validators[i]) continue;
      sum = sum.plus(validators[i].weight);
    }
    
    this.percentCache = sum.mul(100).idiv(total).toNumber();
    if (this.percentCache > 100) {
      this.percentCache = 100;
    }
    return this.percentCache!;
  }

  top(percent: number, total: U256, validators: CrossChainValidator[]): CrossChainValidator[] {
    if (total.eq(0)) return [];

    const result:  CrossChainValidator[] = [];
    let enough = false;
    let sum = new U256(0);
    for (let i of validators) {
      if (!this.signatures[i.validator]) continue;
      sum = sum.plus(i.weight);
      result.push(i);
      if (sum.mul(100).idiv(total).gt(percent)) {
        enough = true;
        break;
      }
    }
    return enough ? result : [];
  }

  clearPercentCache() {
    this.percentCache = undefined;
  }
}

class CreationParameters {
  name: string = '';
  symbol: string = '';
  chain: string = '';

  fromJson(json: any): boolean {
    this.name = json.name;
    this.symbol = json.symbol;
    this.chain = json.chain;
    return !(this.name && this.symbol && this.chain);
  }
}

class CreationSignatures {
  originalChain: string = '';
  originalContract: string = '';
  targetChain: string = '';
  type: string = '';
  decimals: number = 0;
  params?: CreationParameters;
  signatures: { [validator: string]: CrossChainSignature } = {};
  percentCache?: number;
  round: number = 0;
  lastQueryAt: number = 0;

  constructor(
    originalChain: string,
    originalContract: string,
    targetChain: string,
    type: string,
    decimals: number) {
    this.originalChain = originalChain;
    this.originalContract = originalContract;
    this.targetChain = targetChain;
    this.type = type;
    this.decimals = decimals;
  }

  percent(total: U256, validators: CrossChainValidators): number {
    if (this.percentCache !== undefined) {
      return this.percentCache;
    }

    if (total.eq(0)) {
      return 0;
    }

    let sum = new U256(0);
    for (let i in this.signatures) {
      if (!validators[i]) continue;
      sum = sum.plus(validators[i].weight);
    }
    
    this.percentCache = sum.mul(100).idiv(total).toNumber();
    if (this.percentCache > 100) {
      this.percentCache = 100;
    }
    return this.percentCache!;
  }

  top(percent: number, total: U256, validators: CrossChainValidator[]): CrossChainValidator[] {
    if (total.eq(0)) return [];

    const result:  CrossChainValidator[] = [];
    let enough = false;
    let sum = new U256(0);
    for (let i of validators) {
      if (!this.signatures[i.validator]) continue;
      sum = sum.plus(i.weight);
      result.push(i);
      if (sum.mul(100).idiv(total).gt(percent)) {
        enough = true;
        break;
      }
    }
    return enough ? result : [];
  }

  clearPercentCache() {
    this.percentCache = undefined;
  }
}

export class EIP712 {
  static common(chain: string): any {
    const chainId = ChainHelper.toEvmChain(chain);
    if (chainId === undefined) {
      throw new Error(`EIP712::common: failed to convert to evm chain, chain=${chain}`);
    }
    const core = Web3Service.getCoreContractAddress(chain as ChainStr);
    if (!core) {
      throw new Error(`EIP712::common: failed to get core contract, chain=${chain}`);
    }
    return {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
      },
      domain: {
        name: 'Raicoin',
        version: '1.0',
        chainId,
        verifyingContract: core,
      }
    };
  }

  static hashTypedData(data: any): string {
    const message = data as TypedMessage<MessageTypes>;
    const hash = TypedDataUtils.eip712Hash(message, SignTypedDataVersion.V4).toString('hex');
    return ZX + hash;
  }

  static createWrappedERC20Token(
    chain: string,
    name: string,
    symbol: string,
    originalChain: string,
    originalChainId: string,
    originalContract: string,
    decimals: string
  ): any {
    const data = EIP712.common(chain);
    data.types.CreateWrappedERC20Token = [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "originalChain", type: "string" },
      { name: "originalChainId", type: "uint32" },
      { name: "originalContract", type: "bytes32" },
      { name: "decimals", type: "uint8" },
    ];
    data.primaryType = 'CreateWrappedERC20Token';
    data.message =  {
      name,
      symbol,
      originalChain,
      originalChainId,
      originalContract,
      decimals,
    };
    return data;
  }

  static createWrappedERC721Token(
    chain: string,
    name: string,
    symbol: string,
    originalChain: string,
    originalChainId: string,
    originalContract: string
  ): any {
    const data = EIP712.common(chain);
    data.types.CreateWrappedERC721Token = [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "originalChain", type: "string" },
      { name: "originalChainId", type: "uint32" },
      { name: "originalContract", type: "bytes32" },
    ];
    data.primaryType = 'CreateWrappedERC721Token';
    data.message =  {
      name,
      symbol,
      originalChain,
      originalChainId,
      originalContract,
    };
    return data;
  }

  static unmapERC20(chain: string, token: string, sender: string, recipient: string,
    txnHash: string, txnHeight: string, share: string): any {
    const data = EIP712.common(chain);
    data.types.UnmapERC20 = [
      { name: "token", type: "address" },
      { name: "sender", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "txnHash", type: "bytes32" },
      { name: "txnHeight", type: "uint64" },
      { name: "share", type: "uint256" },
    ];
    data.primaryType = 'UnmapERC20';
    data.message = {
      token,
      sender,
      recipient,
      txnHash,
      txnHeight,
      share,
    };
    return data;
  }

  static unmapETH(chain: string, sender: string, recipient: string, txnHash: string,
    txnHeight: string, amount: string): any {
    const data = EIP712.common(chain);
    data.types.UnmapETH = [
      { name: "sender", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "txnHash", type: "bytes32" },
      { name: "txnHeight", type: "uint64" },
      { name: "amount", type: "uint256" },
    ];
    data.primaryType = 'UnmapETH';
    data.message = {
      sender,
      recipient,
      txnHash,
      txnHeight,
      amount,
    }
    return data;
  }

  static unmapERC721(chain: string, token: string, sender: string, recipient: string,
    txnHash: string, txnHeight: string, tokenId: string): any {
      const data = EIP712.common(chain);
      data.types.UnmapERC721 = [
        { name: "token", type: "address" },
        { name: "sender", type: "bytes32"},
        { name: "recipient", type: "address"},
        { name: "txnHash", type: "bytes32"},
        { name: "txnHeight", type: "uint64"},
        { name: "tokenId", type: "uint256"},
      ];
      data.primaryType = 'UnmapERC721';
      data.message =  {
        token,
        sender,
        recipient,
        txnHash,
        txnHeight,
        tokenId,
    }
    return data;
  }

  static wrapERC20Token(chain: string, originalChainId: string, originalContract: string,
    sender: string, recipient: string, txnHash: string, txnHeight: string, amount: string): any {
      const data = EIP712.common(chain);
      data.types.WrapERC20Token = [
        { name: "originalChainId", type: "uint32" },
        { name: "originalContract", type: "bytes32" },
        { name: "sender", type: "bytes32" },
        { name: "recipient", type: "address" },
        { name: "txnHash", type: "bytes32" },
        { name: "txnHeight", type: "uint64" },
        { name: "amount", type: "uint256" },
      ];
      data.primaryType = 'WrapERC20Token';
      data.message = {
        originalChainId,
        originalContract,
        sender,
        recipient,
        txnHash,
        txnHeight,
        amount,
      };
      return data;
  }

  static wrapERC721Token(chain: string, originalChainId: string, originalContract: string,
    sender: string, recipient: string, txnHash: string, txnHeight: string, tokenId: string): any {
      const data = EIP712.common(chain);
      data.types.WrapERC721Token = [
        { name: "originalChainId", type: "uint32" },
        { name: "originalContract", type: "bytes32" },
        { name: "sender", type: "bytes32" },
        { name: "recipient", type: "address" },
        { name: "txnHash", type: "bytes32" },
        { name: "txnHeight", type: "uint64" },
        { name: "tokenId", type: "uint256" },
      ];
      data.primaryType = 'WrapERC721Token';
      data.message = {
        originalChainId,
        originalContract,
        sender,
        recipient,
        txnHash,
        txnHeight,
        tokenId,
      };
      return data;
  }

}