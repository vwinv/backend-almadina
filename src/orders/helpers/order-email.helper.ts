import { OrderStatus } from '@prisma/client';
import { EmailService, OrderEmailData } from '../../email/email.service';

export async function sendOrderStatusEmail(
  emailService: EmailService | undefined,
  order: any,
  status: OrderStatus,
): Promise<void> {
  if (!emailService || !order?.user?.email) {
    return;
  }

  try {
    const emailData: OrderEmailData = {
      orderId: order.id,
      customerName: `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim() || 'Client',
      customerEmail: order.user.email,
      orderNumber: order.id.toString(),
      orderDate: order.createdAt,
      status: status,
      items: order.items?.map((item: any) => ({
        productName: item.product?.name || 'Produit',
        quantity: item.quantity,
        price: parseFloat(item.price.toString()),
      })) || [],
      total: parseFloat(order.total.toString()),
      shippingAddress: order.shippingAddress
        ? {
            address: order.shippingAddress.address,
            city: order.shippingAddress.city,
            postalCode: order.shippingAddress.postalCode || undefined,
            country: order.shippingAddress.country || undefined,
          }
        : undefined,
      trackingNumber: undefined, // À ajouter si vous avez un système de tracking
      deliveryPersonName: order.deliveryPerson
        ? `${order.deliveryPerson.firstName || ''} ${order.deliveryPerson.lastName || ''}`.trim()
        : undefined,
    };

    await emailService.sendOrderStatusEmail(emailData);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de notification:', error);
    // Ne pas faire échouer la requête si l'email échoue
  }
}
