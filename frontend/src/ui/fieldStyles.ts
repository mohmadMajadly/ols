// أصناف مشتركة بين حقول الإدخال (TextField/PasswordField/TextArea/Select) لضمان اتساق
// الحدود والتركيز والحالات بلا تكرار hex/قيم حرفية.

export const fieldLabelClasses = 'mb-1.5 block text-sm font-medium text-hibr'

export const fieldHelpClasses = 'mt-1.5 text-sm text-hibr-2'

export const fieldErrorClasses = 'mt-1.5 text-sm text-khata-hifz'

export const fieldBaseClasses =
  'w-full rounded-control border border-khatt bg-waraq-raised text-hibr placeholder:text-hibr-3 ' +
  'transition-colors duration-150 focus:border-lazward-700 ' +
  'disabled:cursor-not-allowed disabled:bg-waraq disabled:text-hibr-3'

export const fieldErrorBorderClasses = 'border-khata-hifz focus:border-khata-hifz'
