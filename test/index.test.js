/* eslint-env browser */
import * as raw from 'multiformats/codecs/raw'
import * as dagCBOR from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as Block from 'multiformats/block'
import { equals } from 'multiformats/bytes'
import { CARWriterStream, CARReaderStream } from '../src/index.js'

export const test = {
  /** @type {import('entail').Test} */
  'should round trip': async assert => {
    const leaf = await Block.encode({ value: new Uint8Array(), codec: raw, hasher })
    const root = await Block.encode({ value: { leaf: leaf.cid }, codec: dagCBOR, hasher })

    const srcBlocks = [leaf, root]
    const readable = new ReadableStream({
      pull (controller) {
        const block = srcBlocks.shift()
        if (!block) return controller.close()
        controller.enqueue(block)
      }
    })

    const destBlocks = []
    await readable
      .pipeThrough(new CARWriterStream([root.cid]))
      .pipeThrough(new CARReaderStream())
      .pipeTo(new WritableStream({ write: block => { destBlocks.push(block) } }))

    assert.equal(destBlocks.length, 2)
    assert.equal(destBlocks[0].cid.toString(), leaf.cid.toString())
    assert.ok(equals(destBlocks[0].bytes, leaf.bytes))
    assert.equal(destBlocks[1].cid.toString(), root.cid.toString())
    assert.ok(equals(destBlocks[1].bytes, root.bytes))
    return undefined
  }
}
