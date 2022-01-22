import { Injectable } from '@angular/core';
import * as blake from 'blakejs';
import { BigNumber } from 'bignumber.js'

const nacl = window['nacl'];
const account_letters = '13456789abcdefghijkmnopqrstuwxyz'.split('');

@Injectable({
  providedIn: 'root'
})
export class UtilService {
  constructor() { }

  uint8 = {
    toUint4: uint8ToUint4,
    toHex: uint8ToHex,
    toHash: uint8ToHash,
  };

  uint5 = {
    toString: uint5ToString,
  };

  uint4 = {
    toUint5: uint4ToUint5,
  };

  dec = {
    toHex: decToHex,
  };

  hex = {
    toUint8: hexToUint8,
  };

  account = {
    generateSeed: generateSeed,
    generatePrivateKey: generatePrivateKey,
    generateAccountKeyPair: generateAccountKeyPair,
    generateAddress: generateAddress,
    sign: sign,
    verify: verify
  };

  other = {
    shortAddress: shortAddress
  };
}

function uint8ToUint4(uint8: Uint8Array): Uint8Array {
  const uint4 = new Uint8Array(uint8.length * 2);

  for (let i = 0; i < uint8.length; i++) {
    uint4[i*2] = uint8[i] / 16 | 0;
    uint4[i*2+1] = uint8[i] % 16;
  }

  return uint4;
}

function uint8ToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    let aux = bytes[i].toString(16).toUpperCase();
    if(aux.length == 1) {
      aux = '0'+aux;
    }
    hex += aux;
  }

  return hex;
}

function uint8ToHash(bytes: Uint8Array): Uint8Array {
  const ctx = blake.blake2bInit(32);
  blake.blake2bUpdate(ctx, bytes);
  return blake.blake2bFinal(ctx);
}

function uint5ToString(uint5: Uint8Array): string {
  const letters = account_letters;
  let string = "";

  for (let i = 0; i < uint5.length; i++) {
    string += letters[uint5[i]];
  }

  return string;
}

function uint5ToUint4(uint5: Uint8Array): Uint8Array {
  let length = Math.ceil(uint5.length / 4 * 5);
  let uint4 = new Uint8Array(length);
  for (let i = 0; i < uint5.length; i++) {
    let j = i * 5 / 4 | 0;
    let bit = i * 5 % 4;
    let u4Index = uint4.length - 1 - j;
    let u5Index = uint5.length - 1 - i;
    uint4[u4Index] |= (uint5[u5Index] & (0x1f >>> (1 + bit))) << bit;
    uint4[u4Index - 1] = uint5[u5Index] >>> (4 - bit);
  }
  return uint4;
}

function uint4ToUint5(uint4: Uint8Array): Uint8Array {
  let length = Math.ceil(uint4.length * 4 / 5);
  let uint5 = new Uint8Array(length);
  for (let i = 0; i < uint4.length; i++) {
    let left = 5 - (i * 4) % 5;
    let use = left > 4 ? 4 : left;
    let m = uint4[uint4.length - 1 -i];
    let index = (i * 4) / 5 | 0;
    uint5[index] |= (m & (0xf >>> (4 - use))) << (5 - left);
    if (use < 4)
    {
      uint5[index + 1] |= m >>> use;
    }
  }
  return uint5.reverse();
}

function uint4ToUint8(uint4: Uint8Array): Uint8Array {
  let length = Math.ceil(uint4.length / 2);
  let uint8 = new Uint8Array(length);
  for (let i = 0; i < uint4.length; ++i) {
    let u4Index = uint4.length - 1 -i;
    let u8Index = uint8.length - 1 - (i / 2 | 0);
    uint8[u8Index] |= i % 2 ? uint4[u4Index] << 4 : uint4[u4Index];
  }

  return uint8;
}

function decToHex(dec: number, bytes: number = 0): string {
  let decArray: string[] = dec.toString().split('');
  let sum: number[] = [];
  let hex: string = '';
  let hexArray:string[] = [];
  let i: number;
  let s: number;

  while(decArray.length) {
    s = parseInt(decArray.shift()!);
    for(i = 0; s || i < sum.length; i++)
    {
      s += (sum[i] || 0) * 10
      sum[i] = s % 16
      s = (s - sum[i]) / 16
    }
  }
  while(sum.length) {
    hexArray.push(sum.pop()!.toString(16));
  }

  hex = hexArray.join('');

  if(hex.length % 2) {
    hex = "0" + hex;
  }

  if(bytes > hex.length / 2) {
    let diff = bytes - hex.length / 2;
    for(let j = 0; j < diff; j++) {
      hex = "00" + hex;
    }
  }

  return hex;
}

function hexToUint8(hex: string): Uint8Array {
  if (hex.length % 2)
  {
    return new Uint8Array(0);
  }

  const length = hex.length / 2;
  const uint8 = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    uint8[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return uint8;
}

function boolStrToUint8(bool: string): Uint8Array {
  const uint8 = new Uint8Array(1);
  if (bool === "true") {
    uint8[0] = 1;
    return uint8;
  } else if (bool === "false") {
    uint8[0] = 0;
    return uint8;
  } else {
    return new Uint8Array();
  }
}

function uint8ToBoolStr(array: Uint8Array, offset: number): string {
  if (array.length <= offset) return '';
  if (array[offset] === 0) {
    return 'false';
  } else if (array[offset] === 1) {
    return 'true';
  } else {
    return '';
  }
}

function generateSeed(): Uint8Array {
  return nacl.randomBytes(32);
}

function generatePrivateKey(seed: Uint8Array, index: number): Uint8Array {
  const ctx = blake.blake2bInit(32);
  blake.blake2bUpdate(ctx, seed);
  blake.blake2bUpdate(ctx, hexToUint8(decToHex(index, 4)));
  return blake.blake2bFinal(ctx);
}

function generateAccountKeyPair(privateKey: Uint8Array) {
  return nacl.sign.keyPair.fromSecretKey(privateKey);
}

function generateAddress(publicKey: Uint8Array, prefix: string = 'rai') {

  const raw = uint5ToString(uint4ToUint5(uint8ToUint4(publicKey)));
  const checksumUint8 = blake.blake2b(publicKey, null, 5).reverse();
  const checksum = uint5ToString(uint4ToUint5(uint8ToUint4(checksumUint8)));

  return `${prefix}_${raw}${checksum}`;
}

function sign(privateKey: Uint8Array, hash: Uint8Array): Uint8Array {
  return nacl.sign.detached(hash, privateKey);
}

function verify(hash: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  return !nacl.sign.detached.verify(hash, signature, publicKey);
}

function array_crop (array: any) {
  let length = array.length - 1;
  let cropped_array = new Uint8Array(length);
  for (let i = 0; i < length; i++)
    cropped_array[i] = array[i+1];
  return cropped_array;
}

function equal_arrays (array1: any, array2: any) {
  for (let i = 0; i < array1.length; i++) {
    if (array1[i] != array2[i])	return false;
  }
  return true;
}

function stringToUint5(str: string) {
  let letters = account_letters;
  let length = str.length;
  let str_array = str.split('');
  let uint5 = new Uint8Array(length);
  for (let i = 0; i < length; i++)	uint5[i] = letters.indexOf(str_array[i]);
  return uint5;
}

function shortAddress(addr: string, reserve: number = 5): string {
  if (addr.startsWith('rai_') && addr.length  == 64) {
    return addr.substr(0, reserve + 4) + '...' + addr.substr(-reserve);
  }
  return addr;
}

export type Uall = U8 | U16 | U32 | U64 | U128 | U256 | U512;
export type UintFrom = number | string | BigNumber | Uall;

class UintHelper {
  static create(size: number, value: UintFrom, base?: number): Uall {
    switch (size) {
      case 1 : return new U8(value, base, false);
      case 2 : return new U16(value, base, false);
      case 4 : return new U32(value, base, false);
      case 8 : return new U64(value, base, false);
      case 16: return new U128(value, base, false);
      case 32: return new U256(value, base, false);
      case 64: return new U512(value, base, false);
      default: return new U512(value, base, false);
    }
  }

  static borrow(size: number): BigNumber {
    return new BigNumber(2).pow(size * 8);
  }

  static max(size: number): Uall {
    return UintHelper.create(size, UintHelper.borrow(size).minus(1));
  }
}

class Uint {
  readonly size: number = 0;
  bytes: Uint8Array;

  constructor(from: UintFrom, base: number | undefined, size: number, check: boolean = true) {
    let n: BigNumber;
    if (from instanceof Uint) {
      if (check &&  size < from.size) {
        throw new Error(`Uint constructor: size narrowing, from=${from.size}, to=${size}`);
      }
      n = from.toBigNumber();
    }
    else {
      n = new BigNumber(from, base);
    }

    if (!n.isInteger() || n.isNegative() || size === 0) {
      throw new Error(`Uint constructor: bad parameter, from=${from}, base=${base}, size=${size}`);
    }
  
    let a = new Uint8Array(size);
    for (let i = size - 1; i >= 0; --i) {
      let r = n.mod(256);
      a[i] = r.toNumber();
      n = n.minus(r).div(256);
      if (n.isZero()) {
        break;
      }
    }
  
    if (check && !n.isZero()) {
      throw new Error(`Uint constructor: overflow, from=${from}, base=${base}, size=${size}`);
    }
  
    this.bytes = a;
  }

  fromArray(array: Uint8Array, offset: number): boolean {
    let error = true;
    if (offset > array.length - this.size) return error;
    this.bytes = array.slice(offset, offset + this.size);
    return false;
  }

  toBigNumber(): BigNumber {
    let b = new BigNumber(0);
    for (let i = 0; i < this.bytes.length; ++i) {
      b = b.mul(256).plus(this.bytes[i]);
    }
    return b;
  }

  toNumber(): number {
    return this.toBigNumber().toNumber();
  }

  toHex(): string {
    return uint8ToHex(this.bytes);
  }

  toDec(): string {
    return this.toBigNumber().toFixed();
  }

  plus(other: UintFrom, base?: number): Uall {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let sum = this.toBigNumber().plus(other);
    return UintHelper.create(this.size, sum);
  }

  minus(other: UintFrom, base?: number): Uall {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let left = this.toBigNumber();
    if (left.lessThan(other)) {
      left = left.plus(UintHelper.borrow(this.size));
    }
    return UintHelper.create(this.size, left.minus(other));
  }

  mod(other: UintFrom, base?: number): Uall {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return UintHelper.create(this.size, this.toBigNumber().mod(other));
  }

  eq(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().eq(other);
  }

  gt(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().gt(other);
  }

  gte(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().gte(other);
  }

  lt(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().lt(other);
  }

  lte(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().lte(other);
  }

  mul(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let sum = this.toBigNumber().mul(other);
    return UintHelper.create(this.size, sum);
  }

  idiv(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let quotient = this.toBigNumber().dividedToIntegerBy(other);
    return UintHelper.create(this.size, quotient);
  }
}

export enum BlockType {
  INVALID     = 0,
  TX_BLOCK    = 1,  // Transaction Block
  REP_BLOCK   = 2,  // Representive Block
  AD_BLOCK    = 3,  // Airdrop Block
}

export enum BlockTypeStr {
  INVALID     = 'invalid',
  TX_BLOCK    = 'transaction',
  REP_BLOCK   = 'representive',
  AD_BLOCK    = 'airdrop',
}

type BlockTypeMap = [BlockType, BlockTypeStr];
const blockTypeMaps: BlockTypeMap[] = [
  [BlockType.TX_BLOCK, BlockTypeStr.TX_BLOCK],
  [BlockType.REP_BLOCK, BlockTypeStr.REP_BLOCK],
  [BlockType.AD_BLOCK, BlockTypeStr.AD_BLOCK]
]

export enum BlockOpcode {
  INVALID = 0,
  SEND    = 1,
  RECEIVE = 2,
  CHANGE  = 3,
  CREDIT  = 4,
  REWARD  = 5,
  DESTROY = 6,
}

export enum BlockOpcodeStr {
  INVALID = 'invalid',
  SEND    = 'send',
  RECEIVE = 'receive',
  CHANGE  = 'change',
  CREDIT  = 'credit',
  REWARD  = 'reward',
  DESTROY = 'destroy',
}

type BlockOpcodeMap = [BlockOpcode, BlockOpcodeStr];
const blockOpcodeMaps: BlockOpcodeMap[] = [
  [BlockOpcode.SEND, BlockOpcodeStr.SEND],
  [BlockOpcode.RECEIVE, BlockOpcodeStr.RECEIVE],
  [BlockOpcode.CHANGE, BlockOpcodeStr.CHANGE],
  [BlockOpcode.CREDIT, BlockOpcodeStr.CREDIT],
  [BlockOpcode.REWARD, BlockOpcodeStr.REWARD],
  [BlockOpcode.DESTROY, BlockOpcodeStr.DESTROY],
]

export class U8 extends Uint {
  static readonly SIZE = 1;
  static _MAX: U8 | undefined;
  static max(): U8 {
    if (!U8._MAX) {
      U8._MAX = UintHelper.max(U8.SIZE) as U8;
    }
    return U8._MAX;
  }
  
  readonly size = U8.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U8.SIZE, check);
  }

  fromBlockTypeString(str: string): boolean {
    let error = true;
    let map = blockTypeMaps.find(x => str === x[1]);
    if (!map) return error;
    let n: number = map[0];

    this.bytes = new U8(n).bytes;
    return false;
  }

  toBlockTypeStr(): string {
    let n = this.toNumber();
    let map = blockTypeMaps.find(x => n === x[0]);
    if (map) return map[1];
    return BlockTypeStr.INVALID;
  }

  fromBlockOpcodeStr(str: string): boolean {
    let error = true;
    let map = blockOpcodeMaps.find(x => str === x[1]);
    if (!map) return error;
    let n: number = map[0];

    this.bytes = new U8(n).bytes;
    return false;
  }

  toBlockOpcodeStr(): string {
    let n = this.toNumber();
    let map = blockOpcodeMaps.find(x => n === x[0]);
    if (map) return map[1];
    return BlockOpcodeStr.INVALID;
  }

  isSend(): boolean {
    return this.toNumber() === BlockOpcode.SEND;
  }
}

export class U16 extends Uint {
  static readonly SIZE = 2;
  static _MAX: U16 | undefined;
  static max(): U16 {
    if (!U16._MAX) {
      U16._MAX = UintHelper.max(U16.SIZE) as U16;
    }
    return U16._MAX;
  }

  readonly size = U16.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U16.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U16 {
    return super.plus(other, base) as U16;
  }

  minus(other: UintFrom, base?: number): U16 {
    return super.minus(other, base) as U16;
  }

  fromExtensionTypeStr(str: string): boolean {
    let map = extensionTypeMaps.find(x => str === x[1]);
    if (map) {
      this.bytes = new U16(map[0]).bytes;
      return false;
    }
    
    try {
      this.bytes = new U16(str).bytes;
      return false;
    }
    catch (e) {
      return true;
    }
  }

  toExtensionTypeStr(): string {
    let n = this.toNumber();
    let map = extensionTypeMaps.find(x => n === x[0]);
    if (map) return map[1];
    return this.toDec();
  }
}

export class U32 extends Uint {
  static readonly SIZE = 4;
  static _MAX: U32 | undefined;
  static max(): U32 {
    if (!U32._MAX) {
      U32._MAX = UintHelper.max(U32.SIZE) as U32;
    }
    return U32._MAX;
  }

  readonly size = U32.SIZE;

  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U32.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U32 {
    return super.plus(other, base) as U32;
  }
  
}

export class U64 extends Uint {
  static readonly SIZE = 8;
  static _MAX: U64 | undefined;
  static max(): U64 {
    if (!U64._MAX) {
      U64._MAX = UintHelper.max(U64.SIZE) as U64;
    }
    return U64._MAX;
  }
  
  readonly size = U64.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U64.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U64 {
    return super.plus(other, base) as U64;
  }

  minus(other: UintFrom, base?: number): U64 {
    return super.minus(other, base) as U64;
  }

  sameDay(other: UintFrom): boolean {
    let a = this.toBigNumber();
    let b = new U64(other).toBigNumber();
    a = a.minus(a.mod(86400));
    b = b.minus(b.mod(86400));
    return a.eq(b);
  }

}

export class U128 extends Uint {
  static readonly SIZE = 16;
  static _RAI: U128 | undefined;
  static RAI(): U128 {
    if (!U128._RAI) {
      U128._RAI = new U128('1000000000');
    }
    return U128._RAI;
  }
  
  readonly size = U128.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U128.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U128 {
    return super.plus(other, base) as U128;
  }

  minus(other: UintFrom, base?: number): U128 {
    return super.minus(other, base) as U128;
  }

  mul(other: UintFrom, base?: number): U128 {
    return super.mul(other, base) as U128;
  }

  idiv(other: UintFrom, base?: number): U128 {
    return super.idiv(other, base) as U128;
  }

  toBalanceStr(scale: U128, decimals?: U8): string {
    if (typeof decimals !== 'undefined') {
      return this.toBigNumber().div(scale.toBigNumber()).toFixed(decimals.toNumber(), 1);
    }

    let result = this.toBalanceStr(scale, new U8(9));
    while (result.length > 1 && result[result.length - 1] === '0') {
      result = result.slice(0, result.length - 1);
    }

    if (result[result.length - 1] === '.') {
      result = result.slice(0, result.length - 1);
    }

    return result;
  }

}

export class U256 extends Uint {
  static readonly SIZE = 32;
  
  readonly size = U256.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U256.SIZE, check);
  }

  mul(other: UintFrom, base?: number): U256 {
    return super.mul(other, base) as U256;
  }

  idiv(other: UintFrom, base?: number): U256 {
    return super.idiv(other, base) as U256;
  }

  toAccountAddress(): string {
    return generateAddress(this.bytes);
  }

  fromAccountAddress(str: string): boolean {
    if (str.length !== 64) return true;
    if(!str.startsWith('rai_1') && !str.startsWith('rai_3')) {
      return true;
    }

    let account_crop = str.substring(4,64);
    let isValid = /^[13456789abcdefghijkmnopqrstuwxyz]+$/.test(account_crop);
    if (!isValid) return true;

    let key_uint4 = array_crop(uint5ToUint4(stringToUint5(account_crop.substring(0, 52))));
    let hash_uint4 = uint5ToUint4(stringToUint5(account_crop.substring(52, 60)));
    let key_array = uint4ToUint8(key_uint4);
    let blake_hash = blake.blake2b(key_array, null, 5).reverse();

    if (!equal_arrays(hash_uint4, uint8ToUint4(blake_hash))) return true;

    this.bytes = key_array;
    return false;
  }

  toBalanceStr(decimals: U8): string {
    const BigNumberCustom = BigNumber.another({ DECIMAL_PLACES: 255 });
    const decimalsValue = new BigNumberCustom(10).pow(decimals.toNumber());
    let result = new BigNumberCustom(this.toBigNumber()).div(decimalsValue).toFormat(decimals.toNumber(), 1);

    if (decimals.toNumber() === 0)
    {
      return result;
    }

    while (result.length > 1 && result[result.length - 1] === '0') {
      result = result.slice(0, result.length - 1);
    }

    if (result[result.length - 1] === '.') {
      result = result.slice(0, result.length - 1);
    }

    return result;
  }
}

export class U512 extends Uint {
  static readonly SIZE = 64;
  
  readonly size = U512.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U512.SIZE, check);
  }
}


export enum ExtensionType {
  INVALID     = 0,
  SUB_ACCOUNT = 1,
  NOTE        = 2,
  ALIAS       = 3,
  TOKEN       = 4,

  RESERVED_MAX = 1023,
}

export enum ExtensionTypeStr {
  INVALID     = 'invalid',
  SUB_ACCOUNT = 'sub_account',
  NOTE        = 'note',
  ALIAS       = 'alias',
  TOKEN       = 'token',
}

export enum ExtensionAliasOp {
  INVALID     = 0,
  NAME        = 1,
  DNS         = 2,
}

export enum ExtensionAliasOpStr {
  INVALID     = 'invalid',
  NAME        = 'name',
  DNS         = 'dns',
}

export enum ExtensionTokenOp {
  INVALID = 0,
  CREATE  = 1,
  MINT    = 2,
  BURN    = 3,
  SEND    = 4,
  RECEIVE = 5,
  SWAP    = 6,
  UNMAP   = 7,
  WRAP    = 8,
}

export enum ExtensionTokenOpStr {
  INVALID = 'invalid',
  CREATE  = 'create',
  MINT    = 'mint',
  BURN    = 'burn',
  SEND    = 'send',
  RECEIVE = 'receive',
  SWAP    = 'swap',
  UNMAP   = 'unmap',
  WRAP    = 'wrap',
}

export enum TokenType {
  INVALID = 0,
  _20     = 1,
  _721    = 2,
}

export enum TokenTypeStr {
  INVALID = 'invalid',
  _20     = '20',
  _721    = '721',
}

type TokenTypeMap = [TokenType, TokenTypeStr];
const tokenTypeMaps: TokenTypeMap[] = [
  [TokenType.INVALID, TokenTypeStr.INVALID],
  [TokenType._20, TokenTypeStr._20],
  [TokenType._721, TokenTypeStr._721],
]

export class TokenHelper {
  static toType(str: string): TokenType {
    const map = tokenTypeMaps.find(x => str === x[1]);
    if (map) return map[0];
    return TokenType.INVALID;
  }

  static toTypeStr(type: TokenType): string {
    const map = tokenTypeMaps.find(x => type === x[0]);
    if (map) return map[1];
    return '';
  }
}

export enum Chain {
  INVALID                 = 0,
  RAICOIN                 = 1,
  BITCOIN                 = 2,
  ETHEREUM                = 3,
  BINANCE_SMART_CHAIN     = 4,

  RAICOIN_TEST                = 10010,
  BITCOIN_TEST                = 10020,
  ETHEREUM_TEST_ROPSTEN       = 10030,
  ETHEREUM_TEST_KOVAN         = 10031,
  ETHEREUM_TEST_RINKEBY       = 10032,
  ETHEREUM_TEST_GOERLI        = 10033,
  BINANCE_SMART_CHAIN_TEST    = 10040,
}

export enum ChainStr {
  INVALID                 = 'invalid',
  RAICOIN                 = 'raicoin',
  BITCOIN                 = 'bitcoin',
  ETHEREUM                = 'ethereum',
  BINANCE_SMART_CHAIN     = 'binance smart chain',

  RAICOIN_TEST                = 'raicoin testnet',
  BITCOIN_TEST                = 'bitcoin testnet',
  ETHEREUM_TEST_ROPSTEN       = 'ethereum ropsten testnet',
  ETHEREUM_TEST_KOVAN         = 'ethereum kovan testnet',
  ETHEREUM_TEST_RINKEBY       = 'ethereum rinkeby testnet',
  ETHEREUM_TEST_GOERLI        = 'ethereum goerli testnet',
  BINANCE_SMART_CHAIN_TEST    = 'binance smart chain testnet',
}

type ChainMap = [Chain, ChainStr];
const chainMaps: ChainMap[] = [
  [Chain.INVALID, ChainStr.INVALID],
  [Chain.RAICOIN, ChainStr.RAICOIN],
  [Chain.BITCOIN, ChainStr.BITCOIN],
  [Chain.ETHEREUM, ChainStr.ETHEREUM],
  [Chain.BINANCE_SMART_CHAIN, ChainStr.BINANCE_SMART_CHAIN],

  [Chain.RAICOIN_TEST, ChainStr.RAICOIN_TEST],
  [Chain.BITCOIN_TEST, ChainStr.BITCOIN_TEST],
  [Chain.ETHEREUM_TEST_ROPSTEN, ChainStr.ETHEREUM_TEST_ROPSTEN],
  [Chain.ETHEREUM_TEST_KOVAN, ChainStr.ETHEREUM_TEST_KOVAN],
  [Chain.ETHEREUM_TEST_RINKEBY, ChainStr.ETHEREUM_TEST_RINKEBY],
  [Chain.ETHEREUM_TEST_GOERLI, ChainStr.ETHEREUM_TEST_GOERLI],
  [Chain.BINANCE_SMART_CHAIN_TEST, ChainStr.BINANCE_SMART_CHAIN_TEST]
]

export class ChainHelper {
  static toChain(str: string): Chain {
    const map = chainMaps.find(x => str === x[1]);
    if (map) return map[0];
    return Chain.INVALID;
  }

  static toChainStr(chain: Chain): string {
    const map = chainMaps.find(x => chain === x[0]);
    if (map) return map[1];
    return '';
  }
}

interface ExtensionTokenCodec {
  encode(value: any): Uint8Array;
  decode(array: Uint8Array, value: {[key: string]: string}): void;
}

const tokenExtensionCodecs: {[op: string]: ExtensionTokenCodec} = {
  'create': {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      count += 1;
      buffer.set([ExtensionTokenOp.CREATE]);

      if (!value.name || typeof value.name !== 'string') {
        throw new Error(`ExtensionHelper.token.create.encode: invalid name=${value.name}`);
      }
      const name = new TextEncoder().encode(value.name);
      if (name.length > 255) {
        throw new Error(`ExtensionHelper.token.create.encode: invalid name=${value.name}`);
      }
      count += 1;
      buffer.set([name.length]);
      count += name.length;
      buffer.set(name);

      if (!value.symbol || typeof value.symbol !== 'string') {
        throw new Error(`ExtensionHelper.token.create.encode: invalid symbol=${value.symbol}`);
      }
      const symbol = new TextEncoder().encode(value.symbol);
      if (symbol.length > 255) {
        throw new Error(`ExtensionHelper.token.create.encode: invalid symbol=${value.symbol}`);
      }
      count += 1;
      buffer.set([symbol.length]);
      count += symbol.length;
      buffer.set(symbol);

      if (value.type === '20') {
        if (!value.init_supply || typeof value.init_supply !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid init_supply=${value.init_supply}`);
        }
        const initSupply = new U256(value.init_supply);
        count += initSupply.bytes.length;
        buffer.set(initSupply.bytes);

        if (!value.cap_supply || typeof value.cap_supply !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid cap_supply=${value.cap_supply}`);
        }
        const capSupply = new U256(value.cap_supply);
        count += capSupply.bytes.length;
        buffer.set(capSupply.bytes);

        if (!value.decimals || typeof value.decimals !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid decimals=${value.decimals}`);
        }
        const decimals = new U8(value.decimals);
        count += decimals.bytes.length;
        buffer.set(decimals.bytes);

        if (!value.burnable || typeof value.burnable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        const burnable = boolStrToUint8(value.burnable);
        if (burnable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        count += 1;
        buffer.set(burnable);

        if (!value.mintable || typeof value.mintable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid mintable=${value.mintable}`);
        }
        const mintable = boolStrToUint8(value.mintable);
        if (mintable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid mintable=${value.mintable}`);
        }
        count += 1;
        buffer.set(mintable);

        if (!value.circulable || typeof value.circulable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        const circulable = boolStrToUint8(value.circulable);
        if (circulable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        count += 1;
        buffer.set(circulable);

      } else if (value.type === '721') {
        if (!value.base_uri || typeof value.base_uri !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid base_uri=${value.base_uri}`);
        }
        const baseUri = new TextEncoder().encode(value.base_uri);
        if (baseUri.length > 255) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid base_uri=${value.base_uri}`);
        }
        count += 1;
        buffer.set([baseUri.length]);
        count += baseUri.length;
        buffer.set(baseUri);
  
        if (!value.cap_supply || typeof value.cap_supply !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid cap_supply=${value.cap_supply}`);
        }
        const capSupply = new U256(value.cap_supply);
        count += capSupply.bytes.length;
        buffer.set(capSupply.bytes);

        if (!value.burnable || typeof value.burnable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        const burnable = boolStrToUint8(value.burnable);
        if (burnable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        count += 1;
        buffer.set(burnable);

        if (!value.circulable || typeof value.circulable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        const circulable = boolStrToUint8(value.circulable);
        if (circulable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        count += 1;
        buffer.set(circulable);

      } else {
        throw new Error(`ExtensionHelper.token.create.encode: unknown op=${value.type}`);
      }

      return buffer.slice(0, count);
    },
    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.create.decode: invalid stream`);
      let offset = 0;
      let end = 0;
      const length = array.length;
      const type = array[offset];
      offset += 1;

      if (offset + 1 > length) {
        throw streamError;
      }
      const utf8Decoder = new TextDecoder('utf-8', {fatal: true});
      const nameSize = array[offset];
      offset += 1;
      end = offset + nameSize
      if (end > length) {
        throw streamError;
      }
      value.name = utf8Decoder.decode(array.slice(offset, end));
      offset += nameSize;

      if (offset + 1 > length) {
        throw streamError;
      }
      const symbolSize = array[offset];
      offset += 1;
      end = offset + symbolSize;
      if (end > length) {
        throw streamError;
      }
      value.symbol = utf8Decoder.decode(array.slice(offset, end));
      offset += symbolSize;

      if (type === TokenType._20) {
        const initSupply = new U256();
        let error = initSupply.fromArray(array, offset);
        if (error) throw streamError;
        value.init_supply = initSupply.toDec();
        offset += initSupply.bytes.length;

        const capSupply = new U256();
        error = capSupply.fromArray(array, offset);
        if (error) throw streamError;
        value.cap_supply = capSupply.toDec();
        offset += capSupply.bytes.length;

        const decimals = new U8();
        error = decimals.fromArray(array, offset);
        if (error) throw streamError;
        value.decimals = decimals.toDec();
        offset += decimals.bytes.length;

        const burnable = uint8ToBoolStr(array, offset);
        if (!burnable) throw streamError;
        value.burnable = burnable;
        offset += 1;

        const mintable = uint8ToBoolStr(array, offset);
        if (!mintable) throw streamError;
        value.mintable = mintable;
        offset += 1;

        const circulable = uint8ToBoolStr(array, offset);
        if (!circulable) throw streamError;
        value.circulabe = circulable;
        offset += 1;

      } else if (type === TokenType._721) {
        if (offset + 1 > length) {
          throw streamError;
        }
        const baseUriSize = array[offset];
        offset += 1;
        end = offset + baseUriSize
        if (end > length) {
          throw streamError;
        }
        value.base_uri = utf8Decoder.decode(array.slice(offset, end));
        offset += baseUriSize;
  
        const capSupply = new U256();
        let error = capSupply.fromArray(array, offset);
        if (error) throw streamError;
        value.cap_supply = capSupply.toDec();
        offset += capSupply.bytes.length;

        const burnable = uint8ToBoolStr(array, offset);
        if (!burnable) throw streamError;
        value.burnable = burnable;
        offset += 1;

        const circulable = uint8ToBoolStr(array, offset);
        if (!circulable) throw streamError;
        value.circulabe = circulable;
        offset += 1;

      } else {
        throw streamError;
      }

      if (offset !== array.length) throw streamError;
    }
  }
}

interface ExtensionCodec {
  encode(value: any): Uint8Array;
  decode(array: Uint8Array): string | object;
}

const extensionCodecs: {[codec: string]: ExtensionCodec} = {
  hex: {
    encode: (str: string) => {return hexToUint8(str);},
    decode: (array: Uint8Array) => {return uint8ToHex(array);}
  },

  utf8: {
    encode: (str: string) => {return new TextEncoder().encode(str);},
    decode: (array: Uint8Array) => {return new TextDecoder('utf-8', {fatal: true}).decode(array);}
  },

  dec64: {
    encode: (str: string) => {return new U64(str).bytes;},
    decode: (array: Uint8Array) => {
      let u64 = new U64();
      if (u64.fromArray(array, 0)) {
        throw new Error(`ExtensionHelper.dec64.decode: bad parameters=${array}`);
      }
      return u64.toDec();
    }
  },

  alias: {
    encode: (value: {op: string, op_value: string}) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      if (value.op === ExtensionAliasOpStr.NAME){
        count += 1;
        buffer.set([ExtensionAliasOp.NAME]);
      } else if (value.op === ExtensionAliasOpStr.DNS) {
        count += 1;
        buffer.set([ExtensionAliasOp.DNS]);
      } else {
        throw new Error(`ExtensionHelper.alias.encode: unknown op=${value.op}`);
      }
      const op_value = new TextEncoder().encode(value.op_value);
      buffer.set(op_value, count);
      count += op_value.length;
      return buffer.slice(0, count);
    },
    decode: (array: Uint8Array) => {
      if (array.length < 1) {
        throw new Error(`ExtensionHelper.alias.decode: bad length`);
      }

      const value: any = {}
      if (array[0] == ExtensionAliasOp.NAME) {
        value.op = ExtensionAliasOpStr.NAME
      } else if (array[0] == ExtensionAliasOp.DNS) {
        value.op = ExtensionAliasOpStr.DNS;
      } else {
        throw new Error(`ExtensionHelper.alias.decode: unknown op=${array[0]}`);
      }

      value.op_value = new TextDecoder('utf-8', {fatal: true}).decode(array.slice(1));

      return value;
    }
  },

  token: {
    encode : (value: any) => {
      if (!value.op || typeof value.op !== 'string') {
        throw new Error(`ExtensionHelper.token.encode: invalid op=${value.op}`);
      }

      if (!tokenExtensionCodecs[value.op]) {
        throw new Error(`ExtensionHelper.token.encode: codec missing, op=${value.op}`);
      }

      return tokenExtensionCodecs[value.op].encode(value);
    },
    decode :  (array: Uint8Array) => {
      if (array.length <= 1) {
        throw new Error(`ExtensionHelper.token.decode: bad length`);
      }
      const value: any = {}
      if (array[0] == ExtensionTokenOp.CREATE) {
        value.op = ExtensionTokenOpStr.CREATE;
      } else {
        throw new Error(`ExtensionHelper.token.decode: unknown op=${array[0]}`);
      }

      if (!tokenExtensionCodecs[value.op]) {
        throw new Error(`ExtensionHelper.token.decode: codec missing, op=${value.op}`);
      }

      tokenExtensionCodecs[value.op].decode(array.slice(1), value);
      return value;
    }
  }
};

type ExtensionTypeMap = [ExtensionType, ExtensionTypeStr, ExtensionCodec];
const extensionTypeMaps: ExtensionTypeMap[] = [
  [ExtensionType.SUB_ACCOUNT, ExtensionTypeStr.SUB_ACCOUNT, extensionCodecs.utf8],
  [ExtensionType.NOTE, ExtensionTypeStr.NOTE, extensionCodecs.utf8],
  [ExtensionType.ALIAS, ExtensionTypeStr.ALIAS, extensionCodecs.alias],
  [ExtensionType.TOKEN, ExtensionTypeStr.TOKEN, extensionCodecs.token]
]

export enum ExtensionError {
  TYPE = 'type',
  LENGTH = 'length',
  VALUE = 'value',
}

export interface Extension {
  type: string;
  length: string;
  value: string | object;
  error?: ExtensionError;
}

export class ExtensionHelper {
  static decode(array: Uint8Array, offset: number): Extension {
    let e: Extension = {type: ExtensionTypeStr.INVALID, length: '0', value: ''};
    let type = new U16();
    let length = new U16();

    let error = type.fromArray(array, offset);
    if (error) return {...e, error: ExtensionError.TYPE};
    e.type = type.toExtensionTypeStr();

    error = length.fromArray(array, offset + type.size);
    if (error) return {...e, error: ExtensionError.LENGTH};

    let value_offset = offset + type.size + length.size;
    if (array.length < value_offset + length.toNumber()) {
      return {...e, error: ExtensionError.LENGTH};
    }
    e.length = length.toDec();

    let codec = extensionCodecs.hex;
    let map = extensionTypeMaps.find(x => x[0] === type.toNumber());
    if (map) codec = map[2];
    try {
      e.value = codec.decode(array.slice(value_offset, value_offset + length.toNumber()));
    }
    catch (err) {
      return {...e, error: ExtensionError.VALUE};
    }
    
    return e;
  }

  static encodeHex(str: string): Uint8Array {
    return extensionCodecs.hex.encode(str);
  }

  static encode(json: any): Uint8Array {
    let error_result = new Uint8Array(0);
    if (json.error) return error_result;

    let type = new U16();
    let error = type.fromExtensionTypeStr(json.type);
    if (error) return error_result;

    let codec = extensionCodecs.hex;
    let map = extensionTypeMaps.find(x => x[0] === type.toNumber());
    if (map) codec = map[2];

    try {
      let value = codec.encode(json.value);
      let length = new U16(value.length);
      let result = new Uint8Array(type.size + length.size + value.length);
      result.set(type.bytes);
      result.set(length.bytes, type.size);
      result.set(value, type.size + length.size);
      return result;
    }
    catch (err) {
      return error_result;
    }
  }

}