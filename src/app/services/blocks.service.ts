import { Injectable } from '@angular/core';
import * as blake from 'blakejs';
import { U8, U16, U32, U64, U128, U256, U512, BlockTypeStr, BlockOpcodeStr, Extension, ExtensionHelper, ExtensionError, UtilService } from './util.service'
import { ServerService } from './server.service';

@Injectable({
  providedIn: 'root'
})
export class BlocksService {
  private blocks: {[hash: string]: BlockInfo} = {};
  private forks: {[account: string]: {[height: string]: Block[]}} = {};
  private receivables: {[account: string]: Receivable[]} = {};
  private receiving: string[] = [];

  constructor(private server: ServerService, private util: UtilService) {
    
  }

  putBlock(hash: U256, block: Block, amount: Amount, successor: U256 = new U256(0)) {
    this.blocks[hash.toHex()] = { block, amount, successor };
    let previous = this.blocks[block.previous().toHex()];
    if (previous) previous.successor = hash;
  }

  getBlock(hash: U256): BlockInfo | undefined {
    return this.blocks[hash.toHex()];
  }

  getBlockAmount(hash: U256): Amount | undefined {
    return this.blocks[hash.toHex()]?.amount;
  }

  delBlock(hash: U256) {
    let existing = this.getBlock(hash);
    if (existing) {
      let previous = this.getBlock(existing.block.previous());
      if (previous) {
        previous.successor = new U256(0);
      }
      delete this.blocks[hash.toHex()];
    }
  }

  putReceivable(account: U256, receivable: Receivable) {
    let address = account.toAccountAddress();
    if (!this.receivables[address]) {
      this.receivables[address] = [];
    }

    let index = this.receivables[address].findIndex(r => r.amount.lt(receivable.amount));
    if (index === -1) {
      this.receivables[address].push(receivable);
    }
    else {
      this.receivables[address].splice(index, 0, receivable);
    }
  }

  getReceivable(account: U256 | string, hash?: U256 | string): Receivable[] {
    let result: Receivable[] = [];
    if (account instanceof U256) account = account.toAccountAddress();
    if (!this.receivables[account]) {
      return result;
    }

    if (!hash) return this.receivables[account];
    
    if (typeof hash === 'string') hash = new U256(hash, 16);
    let index = this.receivables[account].findIndex(r => r.hash.eq(hash as U256));
    if (index === -1) return result;
    result.push(this.receivables[account][index]);
    return result;
  }

  delReceivable(account: U256, by: Receivable | U256) {
    let address = account.toAccountAddress();
    if (!this.receivables[address]) {
      return;
    }

    let hash = by instanceof U256 ? by : by.hash;
    let index = this.receivables[address].findIndex(r => r.hash.eq(hash));
    if (index === -1) return;
    this.receivables[address].splice(index, 1);
  }

  receivableExists(account: U256, receivable: Receivable): boolean {
    let address = account.toAccountAddress();
    if (!this.receivables[address]) {
      return false;
    }

    let index = this.receivables[address].findIndex(r => r.hash.eq(receivable.hash));
    return index !== -1;
  }

  putReceiving(hash: U256) {
    if (this.receiving.indexOf(hash.toHex()) !== -1) return;
    this.receiving.push(hash.toHex());
  }

  getReceiving(hash: U256) {
    return this.receiving.find(s => s === hash.toHex());
  }

  delReceiving(hash: U256) {
    let index = this.receiving.indexOf(hash.toHex());
    if (index === -1) return;
    this.receiving.splice(index, 1);
  }

  jsonToBlock(json: any): { error: boolean; block?: Block } {
    let error = true;
    if (!json.type) return { error };
    if (json.type === BlockTypeStr.TX_BLOCK) {
      let block = new TxBlock();
      error = block.fromJson(json);
      if (error) return { error };

      return { error: this.verifySignature(block), block };
    }
    else if (json.type === BlockTypeStr.REP_BLOCK) {
      throw new Error('jsonToBlock: TODO');
    }
    else {
      return { error };
    }
  }

  verifySignature(block: Block): boolean {
    return this.util.account.verify(block.hash().bytes, block.signature().bytes, block.account().bytes);
  }

}

export interface Block {
  type(): U8;
  opcode(): U8;
  credit(): U16;
  counter(): U32;
  timestamp(): U64;
  height(): U64;
  account(): U256;
  previous(): U256;
  representative(): U256;
  balance(): U128;
  link(): U256;
  linkStr(): string;
  extensionLength(): U32;
  extensions(): Uint8Array;
  extensionsStr(): string;
  signature(): U512;
  setSignature(signature: string): void;

  hasRepresentative(): boolean;
  hasExtensions(): boolean;
  hash(): U256;
  json(): any;
  fromJson(json: any): boolean;
}

export class TxBlock implements Block {
  private _type: U8 = new U8();
  private _opcode: U8 = new U8();
  private _credit: U16 = new U16;
  private _counter: U32 = new U32();
  private _timestamp: U64 = new U64();
  private _height: U64 = new U64();
  private _account: U256 = new U256();
  private _previous: U256 = new U256();
  private _representative: U256 = new U256();
  private _balance: U128 = new U128();
  private _link: U256 = new U256();
  private _extensionLength: U32 = new U32();
  private _extensions: Uint8Array = new Uint8Array(0);
  private _signature: U512 = new U512();

  static readonly MAX_EXTENSIONS_LENGTH = 256;

  constructor () {
    this._type.fromBlockTypeString(BlockTypeStr.INVALID);
    this._opcode.fromBlockOpcodeStr(BlockOpcodeStr.INVALID);
  }

  type(): U8 {
    return this._type;
  }

  opcode(): U8 {
    return this._opcode;
  }

  credit(): U16 {
    return this._credit;
  }

  counter(): U32 {
    return this._counter;
  }

  timestamp(): U64 {
    return this._timestamp;
  }

  height(): U64 {
    return this._height;
  }

  account(): U256 {
    return this._account;
  }

  previous(): U256 {
    return this._previous;
  }

  representative(): U256 {
    return this._representative;
  }

  balance(): U128 {
    return this._balance;
  }

  link(): U256 {
    return this._link;
  }

  linkStr(): string {
    if (this.opcode().isSend()) {
      return this.link().toAccountAddress();
    }
    else {
      return this.link().toHex();
    }
  }

  extensionLength(): U32 {
    return this._extensionLength;
  }

  extensions(): Uint8Array {
    return this._extensions;
  }

  extensionsStr(): string {
    if (!this.hasExtensions()) return '';
    return JSON.stringify(this.extensionsToJson());
  }

  signature(): U512 {
    return this._signature;
  }

  setSignature(signature: string) {
    this._signature = new U512(signature, 16);
  }

  hasRepresentative(): boolean {
    return true;
  }

  hasExtensions(): boolean {
    return this.extensionLength().gt(0);
  }

  hash(): U256 {
    const context = blake.blake2bInit(32, null);
    blake.blake2bUpdate(context, this.type().bytes);
    blake.blake2bUpdate(context, this.opcode().bytes);
    blake.blake2bUpdate(context, this.credit().bytes);
    blake.blake2bUpdate(context, this.counter().bytes);
    blake.blake2bUpdate(context, this.timestamp().bytes);
    blake.blake2bUpdate(context, this.height().bytes);
    blake.blake2bUpdate(context, this.account().bytes);
    blake.blake2bUpdate(context, this.previous().bytes);
    blake.blake2bUpdate(context, this.representative().bytes);
    blake.blake2bUpdate(context, this.balance().bytes);
    blake.blake2bUpdate(context, this.link().bytes);
    blake.blake2bUpdate(context, this.extensionLength().bytes);
    blake.blake2bUpdate(context, this.extensions());
    let uint8 = blake.blake2bFinal(context) as Uint8Array;
    let result = new U256();
    result.bytes = uint8;
    return result;
  }

  json(): any {
    let json: any = {};
    json.type = this.type().toBlockTypeStr();
    json.opcode = this.opcode().toBlockOpcodeStr();
    json.credit = this.credit().toDec();
    json.counter = this.counter().toDec();
    json.timestamp = this.timestamp().toDec();
    json.height = this.height().toDec();
    json.account = this.account().toAccountAddress();
    json.previous = this.previous().toHex();
    json.representative = this.representative().toAccountAddress();
    json.balance = this.balance().toDec();
    json.link = this.linkStr();
    json.extensions_length = this.extensionLength().toDec();
    json.extensions = this.extensionsToJson();
    json.signature = this.signature().toHex();

    return json;
  }

  fromJson(json: any): boolean {
    try {
      let error = this._type.fromBlockTypeString(json.type);
      if (error) return true;

      error = this._opcode.fromBlockOpcodeStr(json.opcode);
      if (error) return true;

      this._credit = new U16(json.credit);
      this._counter = new U32(json.counter);
      this._timestamp = new U64(json.timestamp);
      this._height = new U64(json.height);
      error = this._account.fromAccountAddress(json.account);
      if (error) return true;
      this._previous = new U256(json.previous, 16);
      error = this._representative.fromAccountAddress(json.representative);
      if (error) return true;
      this._balance = new U128(json.balance);
      if (this.opcode().isSend()) {
        error = this._link.fromAccountAddress(json.link);
        if (error) return true;
      }
      else {
        this._link = new U256(json.link, 16);
      }

      if (json.extensions_raw) {
        this._extensions = ExtensionHelper.encodeHex(json.extensions_raw);
      } else {
        error = this.extensionsFromJson(json.extensions);
        if (error) return true;  
      }

      this._extensionLength = new U32(this._extensions.length);

      if (json.extensions_length) {
        if (!this._extensionLength.eq(json.extensions_length)) return true;
      }

      this._signature = new U512(json.signature, 16);

      return false
    }
    catch (e) {
      console.log('TxBlock.fromJson: failed to parse json=', json, ', exception=', e);
      return true;
    }
  }

  private extensionsToJson(): any {
    let length = this._extensions.length;
    if (length === 0) return '';
    let extensions: Extension[] = [];

    let i = 0;
    while (i < length) {
      let extension = ExtensionHelper.decode(this._extensions, i);
      if (!extension.error) extensions.push(extension);
      if (extension.error && extension.error !== ExtensionError.VALUE) break;
      i += 4 + parseInt(extension.length);
    }

    return extensions;
  }

  private extensionsFromJson(json: any): boolean {
    if (!json) {
      this._extensions = new Uint8Array(0);
      return false;
    }

    let buffer = new Uint8Array(TxBlock.MAX_EXTENSIONS_LENGTH);
    let count = 0;
    for (let i = 0; i < json.length; ++i) {
      let encoded = ExtensionHelper.encode(json[i]);
      if (encoded.length === 0) return true;
      if (count + encoded.length > TxBlock.MAX_EXTENSIONS_LENGTH) return true;
      buffer.set(encoded, count);
      count += encoded.length;
    }

    this._extensions = buffer.slice(0, count);
    return false;
  }

}

export interface BlockInfo {
  block: Block;
  successor: U256;
  amount: Amount;
}

export class Receivable {
  source: U256 = new U256();
  amount: U128 = new U128();
  hash: U256 = new U256();
  timestamp: U64 = new U64();

  fromJson(json: any): boolean {
    try {
      let error = this.source.fromAccountAddress(json.source);
      if (error) return true;
      this.amount = new U128(json.amount);
      this.hash = new U256(json.hash, 16);
      this.timestamp = new U64(json.timestamp);
      
      return false
    }
    catch (e) {
      console.log(`Receivable.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

}

export interface Amount {
  negative: boolean;
  value: U128;
}