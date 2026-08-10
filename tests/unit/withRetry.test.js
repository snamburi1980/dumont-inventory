import { describe, it, expect, vi } from 'vitest'
import { withRetry } from '../../src/utils/withRetry.js'

describe('withRetry()', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, { delayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on a transient failure and succeeds on a later attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce('ok')
    const result = await withRetry(fn, { retries: 2, delayMs: 1 })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('gives up and throws after exhausting all retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still down'))
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).rejects.toThrow('still down')
    expect(fn).toHaveBeenCalledTimes(3) // initial attempt + 2 retries
  })

  it('does NOT retry a permission-denied error — retrying would just delay the same failure', async () => {
    const err = Object.assign(new Error('nope'), { code: 'permission-denied' })
    const fn = vi.fn().mockRejectedValue(err)
    await expect(withRetry(fn, { retries: 3, delayMs: 1 })).rejects.toThrow('nope')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry invalid-argument or unauthenticated errors either', async () => {
    for (const code of ['invalid-argument', 'unauthenticated']) {
      const err = Object.assign(new Error(code), { code })
      const fn = vi.fn().mockRejectedValue(err)
      await expect(withRetry(fn, { retries: 3, delayMs: 1 })).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })

  it('defaults to 2 retries (3 total attempts) when no options are given', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'))
    await expect(withRetry(fn)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(3)
  }, 10000)
})
