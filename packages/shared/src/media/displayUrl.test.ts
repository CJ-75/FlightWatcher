import { describe, expect, it } from 'vitest'
import { supabaseTransformUrl } from './displayUrl'
import { isLocalMediaUri } from './localUri'

describe('isLocalMediaUri', () => {
  it('detects device schemes', () => {
    expect(isLocalMediaUri('file:///var/photo.jpg')).toBe(true)
    expect(isLocalMediaUri('content://media/1')).toBe(true)
    expect(isLocalMediaUri('blob:https://waypop.co/x')).toBe(true)
    expect(isLocalMediaUri('https://waypop.co/x.jpg')).toBe(false)
  })
})

describe('supabaseTransformUrl', () => {
  it('rewrites public object URLs to render/image', () => {
    const src =
      'https://xyz.supabase.co/storage/v1/object/public/media/parcours/steps/a.jpg'
    const out = supabaseTransformUrl(src, { width: 800, quality: 75 })
    expect(out).toContain('/storage/v1/render/image/public/media/')
    expect(out).toContain('width=800')
    expect(out).toContain('quality=75')
  })

  it('leaves Unsplash alone', () => {
    const src = 'https://images.unsplash.com/photo-1?w=800'
    expect(supabaseTransformUrl(src, { width: 400 })).toBe(src)
  })
})
