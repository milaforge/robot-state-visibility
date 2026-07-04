type MotionControlButtonProps = {
  modifier: string
  icon: string
  busy: boolean
  failed: boolean
  disabled: boolean
  idleLabel: string
  busyLabel: string
  failedLabel: string
  idleHint: string
  onClick: () => void
}

export function MotionControlButton({
  modifier,
  icon,
  busy,
  failed,
  disabled,
  idleLabel,
  busyLabel,
  failedLabel,
  idleHint,
  onClick,
}: MotionControlButtonProps) {
  return (
    <button
      className={[
        'motion-control',
        `motion-control--${modifier}`,
        busy ? 'motion-control--busy' : '',
        failed ? 'motion-control--failed' : '',
      ].join(' ')}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="motion-control-icon">
        {busy ? <i className="command-spinner" /> : icon}
      </span>

      <span className="motion-control-copy">
        <strong>
          {busy ? busyLabel : failed ? failedLabel : idleLabel}
        </strong>

        <small>
          {busy ? 'Executing command' : idleHint}
        </small>
      </span>
    </button>
  )
}
