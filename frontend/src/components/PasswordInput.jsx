import { useMemo, useRef, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';

const PasswordInput = ({
  className = '',
  toggleClassName = '',
  showLabel = 'Afficher le mot de passe',
  hideLabel = 'Masquer le mot de passe',
  ...props
}) => {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);

  const ariaLabel = useMemo(
    () => (visible ? hideLabel : showLabel),
    [hideLabel, showLabel, visible],
  );

  return (
    <div className="relative">
      <Input
        {...props}
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        className={`pr-11 ${className}`.trim()}
      />
      <button
        type="button"
        aria-label={ariaLabel}
        onMouseDown={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onClick={() => setVisible((current) => !current)}
        className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-[#F3D67A] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${toggleClassName}`.trim()}
      >
        {visible ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
      </button>
    </div>
  );
};

export default PasswordInput;
