import { UnknownLink } from 'multiformats'

export interface Block {
  cid: UnknownLink
  bytes: Uint8Array
}

export interface Position {
  offset: number
  length: number
}

export interface CARHeader {
  roots: UnknownLink[]
  version: 1
}
