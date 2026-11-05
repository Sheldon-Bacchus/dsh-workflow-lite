/**
 * dsh-workflow-lite — 端口兼容连线规则（纯函数）。
 *
 * 用于在画布连线及端口匹配时判定：
 * 1. portTypesCompatible: 单个端口类型是否相等或满足子类型兼容（未知不猜）。
 * 2. linkAllowedByPorts: 两个节点的端口声明之间是否存在可连接的端口对。
 *
 * @module @xiaoso/dsh-workflow-lite/shared/linkRules
 */

import type { NodeData } from './types.ts'

/**
 * 递归判断 child 是否为 parent 的子类型。
 * 支持两种映射方向：
 * - parent -> children[] （如 { file: ['fastq', 'bam'] }）
 * - child -> parents[] （如 { fastq: ['file'] }）
 */
function isSubtypeRelation(
  candidateSub: string,
  candidateSuper: string,
  subtypes: Record<string, string[]>,
): boolean {
  // 1. 尝试将 subtypes 视为 super -> subs[]
  const visitedSuper = new Set<string>()
  const queueSuper = [candidateSuper]
  while (queueSuper.length > 0) {
    const curr = queueSuper.shift()!
    if (visitedSuper.has(curr)) continue
    visitedSuper.add(curr)
    const directSubs = subtypes[curr]
    if (Array.isArray(directSubs)) {
      for (const sub of directSubs) {
        if (sub === candidateSub) return true
        if (!visitedSuper.has(sub)) queueSuper.push(sub)
      }
    }
  }

  // 2. 尝试将 subtypes 视为 sub -> supers[]
  const visitedSub = new Set<string>()
  const queueSub = [candidateSub]
  while (queueSub.length > 0) {
    const curr = queueSub.shift()!
    if (visitedSub.has(curr)) continue
    visitedSub.add(curr)
    const directSupers = subtypes[curr]
    if (Array.isArray(directSupers)) {
      for (const sup of directSupers) {
        if (sup === candidateSuper) return true
        if (!visitedSub.has(sup)) queueSub.push(sup)
      }
    }
  }

  return false
}

/**
 * 判定两个端口类型是否兼容：
 * - 两个类型相等（忽略首尾空格，且非空）；
 * - 或根据传入的 subtypes 存在子类型派生关系；
 * - 未知类型不瞎猜，一律返回 false。
 */
export function portTypesCompatible(
  a: string,
  b: string,
  subtypes?: Record<string, string[]>,
): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const normA = a.trim()
  const normB = b.trim()
  if (normA === '' || normB === '') return false

  // 1. 类型相等
  if (normA === normB) return true

  // 2. 无子类型词表时，未知不猜
  if (!subtypes || typeof subtypes !== 'object') return false

  // 3. 子类型判定（支持 a 为 b 的子类型，或 b 为 a 的子类型）
  return (
    isSubtypeRelation(normA, normB, subtypes) ||
    isSubtypeRelation(normB, normA, subtypes)
  )
}

/**
 * 根据端口声明判断两节点间是否允许建立连线：
 * - 两端任一方未声明 ports 时返回 true（完全兼容老图）；
 * - 都有端口声明时：
 *   - 任一端声明了 ports 但对应方向为空（source 无 outputs 或 target 无 inputs）→ false；
 *   - 若指定了 sourcePort / targetPort，按指定端口过滤；
 *   - 存在 source.outputs 中某口与 target.inputs 中某口类型兼容才返回 true；
 *   - 其余无匹配端口情况返回 false。
 *
 * 不按顺序/数量猜测绑定，只判断“是否存在可连的端口对”。
 */
export function linkAllowedByPorts(
  source: NodeData,
  target: NodeData,
  subtypes?: Record<string, string[]>,
  sourcePort?: string,
  targetPort?: string,
): boolean {
  // 两端任一方未声明 ports 时放行（兼容旧图）
  if (source.ports === undefined || target.ports === undefined) {
    return true
  }

  const outputs = source.ports.outputs ?? []
  const inputs = target.ports.inputs ?? []

  // 任一端声明了 ports 但对应方向为空 → false
  if (outputs.length === 0 || inputs.length === 0) {
    return false
  }

  const sName =
    typeof sourcePort === 'string' && sourcePort.trim() !== '' ? sourcePort.trim() : undefined
  const tName =
    typeof targetPort === 'string' && targetPort.trim() !== '' ? targetPort.trim() : undefined

  const filteredOutputs = sName
    ? outputs.filter((p) => p.name.trim() === sName)
    : outputs
  const filteredInputs = tName
    ? inputs.filter((p) => p.name.trim() === tName)
    : inputs

  if (filteredOutputs.length === 0 || filteredInputs.length === 0) {
    return false
  }

  // 判断是否存在至少一对兼容端口（多口取交集）
  for (const outPort of filteredOutputs) {
    for (const inPort of filteredInputs) {
      if (portTypesCompatible(outPort.type, inPort.type, subtypes)) {
        return true
      }
    }
  }

  return false
}

/**
 * 连线有效性校验函数：在两端都声明 ports 时按端口类型校验（支持指定具名端口）。
 */
export function isValidConnection(
  source: NodeData,
  target: NodeData,
  subtypes?: Record<string, string[]>,
  sourcePort?: string,
  targetPort?: string,
): boolean {
  return linkAllowedByPorts(source, target, subtypes, sourcePort, targetPort)
}
