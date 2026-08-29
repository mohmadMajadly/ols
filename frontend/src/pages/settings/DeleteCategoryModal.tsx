// حوار تأكيد حذف فئة غير نظامية — يوضّح أن الملاحظات القديمة تبقى محفوظة لكن الفئة
// تختفي من أزرار شاشة الجلسة (DIRECTION §9: لا أزرار حذف حمراء كبيرة، الحذف رمادي
// بحوار تأكيد — الزر المُطلِق هنا Button variant="danger" الرفيع أصلاً، لا لون أحمر صارخ).

import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'

export function DeleteCategoryModal({
  open,
  categoryName,
  onClose,
  onConfirm,
  submitting,
}: {
  open: boolean
  categoryName: string
  onClose: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="حذف الفئة"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={submitting}>
            حذف الفئة
          </Button>
        </>
      }
    >
      <p className="text-hibr-2">
        سيتم حذف فئة «{categoryName}» من قائمة أزرار الملاحظة أثناء الجلسة. الملاحظات المسجَّلة سابقاً بهذه الفئة
        ستبقى محفوظة في سجل الطالب كما هي، ولن تُحذف.
      </p>
    </Modal>
  )
}
