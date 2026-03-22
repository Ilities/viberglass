interface SpinnerProps {
  size?: 'small' | 'medium' | 'large'
}

const sizeClasses = {
  small: 'h-3.5 w-3.5 border-[1.5px]',
  medium: 'h-5 w-5 border-2',
  large: 'h-7 w-7 border-2',
}

export function Spinner({ size = 'medium' }: SpinnerProps) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-[var(--gray-5)] border-t-[var(--gray-10)] ${sizeClasses[size]}`}
    />
  )
}
