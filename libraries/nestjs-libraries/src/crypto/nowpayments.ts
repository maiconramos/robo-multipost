import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';

export interface ProcessPayment {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  outcome_amount: number;
  outcome_currency: string;
}

// Assinatura do IPN da NOWPayments: HMAC-SHA512 do corpo com as chaves
// ordenadas (recursivo), com o "IPN secret" da conta, no header
// x-nowpayments-sig (documentacao oficial do IPN).
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return value;
};

export const isValidNowpaymentsSignature = (
  body: unknown,
  signature: unknown,
  secret: string | undefined
): boolean => {
  if (!secret || typeof signature !== 'string' || !signature) return false;
  const expected = createHmac('sha512', secret)
    .update(JSON.stringify(sortKeys(body)))
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
};

@Injectable()
export class Nowpayments {
  private readonly _logger = new Logger(Nowpayments.name);

  constructor(private _subscriptionService: SubscriptionService) {}

  async processPayment(
    path: string,
    body: ProcessPayment,
    signature?: string
  ): Promise<ProcessPayment | undefined> {
    // Sem a assinatura do IPN qualquer um com a URL de callback marcava o
    // pedido como pago; o corpo tambem escolhia a org. Falha fechado.
    if (
      !isValidNowpaymentsSignature(
        body,
        signature,
        process.env.NOWPAYMENTS_IPN_SECRET
      )
    ) {
      this._logger.warn(
        'NOWPayments IPN recusado: assinatura ausente/invalida ou NOWPAYMENTS_IPN_SECRET nao configurado.'
      );
      return undefined;
    }

    let decrypt: { order_id?: unknown } | null = null;
    try {
      decrypt = AuthService.verifyJWT(path) as { order_id?: unknown };
    } catch {
      return undefined;
    }
    if (!decrypt || typeof decrypt.order_id !== 'string' || !decrypt.order_id) {
      return undefined;
    }

    // o pedido do corpo tem que ser o mesmo assinado na URL de callback
    if (typeof body?.order_id !== 'string' || body.order_id !== decrypt.order_id) {
      return undefined;
    }

    if (
      body.payment_status !== 'confirmed' &&
      body.payment_status !== 'finished'
    ) {
      return undefined;
    }

    const [org, make] = decrypt.order_id.split('_');
    if (!org || !make) {
      return undefined;
    }
    await this._subscriptionService.lifeTime(org, make, 'PRO');
    return body;
  }

  async createPaymentPage(orgId: string) {
    const onlyId = makeId(5);
    const make = orgId + '_' + onlyId;
    const signRequest = AuthService.signJWT({ order_id: make });

    const { id, invoice_url } = await (
      await fetch('https://api.nowpayments.io/v1/invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
        },
        body: JSON.stringify({
          price_amount: process.env.NOWPAYMENTS_AMOUNT,
          price_currency: 'USD',
          order_id: make,
          pay_currency: 'SOL',
          order_description: 'Lifetime deal account for Postiz',
          ipn_callback_url:
            process.env.NEXT_PUBLIC_BACKEND_URL +
            `/public/crypto/${signRequest}`,
          success_url: process.env.FRONTEND_URL + `/launches?check=${onlyId}`,
          cancel_url: process.env.FRONTEND_URL,
        }),
      })
    ).json();

    return {
      id,
      invoice_url,
    };
  }
}
