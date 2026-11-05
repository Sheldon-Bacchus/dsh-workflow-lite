/**
 * dsh-workflow-lite — 步骤卡片端口展示（画布与卡片共用）。
 *
 * 当步骤节点声明了 ports 时，紧凑展示其输入/输出端口（名称、类型、必填标记）；
 * 未声明 ports 的老节点不渲染端口区块。
 *
 * @module @xiaoso/dsh-workflow-lite/client/ui/StepCard
 */

import React from 'react'
import type { NodePorts, PortBindings, PortSpec } from '../../shared/types.ts'

export interface StepCardPortsProps {
  ports?: NodePorts
  bindings?: PortBindings
}

/**
 * 步骤卡片上的端口区块（画布节点内紧凑展示）。
 * 保持紧凑布局与设计令牌，老节点无 ports 时返回 null。
 */
export function StepCardPorts({ ports, bindings }: StepCardPortsProps): React.JSX.Element | null {
  if (!ports) return null
  const inputs = ports.inputs ?? []
  const outputs = ports.outputs ?? []
  if (inputs.length === 0 && outputs.length === 0) return null

  return (
    <div
      data-testid="wl-step-card-ports"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        marginTop: 6,
        paddingTop: 6,
        borderTop: '1px solid var(--wl-line-soft, rgba(255, 255, 255, 0.08))',
        fontSize: 'var(--wl-fs-micro, 11px)',
        lineHeight: 1.3,
      }}
    >
      {inputs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              color: 'var(--wl-text-3)',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            输入
          </span>
          {inputs.map((port) => {
            const binding = bindings?.[port.name]
            return (
              <div
                key={`in-${port.name}`}
                data-testid="wl-card-port-in"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 4,
                  color: 'var(--wl-text-2)',
                }}
                title={port.description}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <span>
                    {port.name}
                    {port.required && (
                      <span
                        data-testid="wl-port-req"
                        style={{
                          color: 'var(--wl-danger, #ef4444)',
                          marginLeft: 2,
                          fontWeight: 'bold',
                        }}
                        title="必填"
                      >
                        *
                      </span>
                    )}
                  </span>
                  {binding && (
                    <span
                      data-testid="wl-port-bound"
                      style={{
                        color: 'var(--wl-primary, #6366f1)',
                        fontSize: '9px',
                        fontFamily: 'var(--wl-mono, monospace)',
                        padding: '0 3px',
                        borderRadius: 2,
                        background: 'var(--wl-hover, rgba(255, 255, 255, 0.08))',
                      }}
                      title={`来自 ${binding.node}.${binding.port}`}
                    >
                      ← {binding.node}.{binding.port}
                    </span>
                  )}
                </span>
                <span
                  data-testid="wl-port-type"
                  style={{
                    flex: 'none',
                    color: 'var(--wl-text-3)',
                    fontFamily: 'var(--wl-mono, monospace)',
                    fontSize: '10px',
                    padding: '0 4px',
                    borderRadius: 3,
                    background: 'var(--wl-hover, rgba(255, 255, 255, 0.06))',
                  }}
                >
                  {port.type}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {outputs.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            marginTop: inputs.length > 0 ? 3 : 0,
          }}
        >
          <span
            style={{
              color: 'var(--wl-text-3)',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            输出
          </span>
          {outputs.map((port) => (
            <div
              key={`out-${port.name}`}
              data-testid="wl-card-port-out"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 4,
                color: 'var(--wl-text-2)',
              }}
              title={port.description}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {port.name}
                {port.required && (
                  <span
                    data-testid="wl-port-req"
                    style={{
                      color: 'var(--wl-danger, #ef4444)',
                      marginLeft: 2,
                      fontWeight: 'bold',
                    }}
                    title="必填"
                  >
                    *
                  </span>
                )}
              </span>
              <span
                data-testid="wl-port-type"
                style={{
                  flex: 'none',
                  color: 'var(--wl-text-3)',
                  fontFamily: 'var(--wl-mono, monospace)',
                  fontSize: '10px',
                  padding: '0 4px',
                  borderRadius: 3,
                  background: 'var(--wl-hover, rgba(255, 255, 255, 0.06))',
                }}
              >
                {port.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface StepCardProps {
  id: string
  title: string
  ports?: NodePorts
  bindings?: PortBindings
  excerpt?: string
  selected?: boolean
}

/**
 * 独立的步骤卡片展示组件。
 */
export function StepCard(props: StepCardProps): React.JSX.Element {
  return (
    <div
      data-testid="wl-step-standalone"
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--wl-line, rgba(255, 255, 255, 0.12))',
        background: 'var(--wl-panel, #1e1e24)',
        color: 'var(--wl-text, #fff)',
        width: 200,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: 4 }}>
        {props.title || props.id}
      </div>
      {props.excerpt && (
        <div style={{ color: 'var(--wl-text-3)', fontSize: '11px', lineHeight: 1.4 }}>
          {props.excerpt}
        </div>
      )}
      <StepCardPorts ports={props.ports} bindings={props.bindings} />
    </div>
  )
}
