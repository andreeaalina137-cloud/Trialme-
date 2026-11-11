import type { FC } from 'react';
import { BrandIcon } from '../BrandIcon';
import type { SubscriptionCategory } from '../../types/subscription';
import type { ServiceLinkContext } from '../../utils/serviceLinkResolver';

export interface MonogramProps {
  name: string;
  category?: SubscriptionCategory;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'card' | 'preset';
  enableLinkPill?: boolean;
  linkContext?: ServiceLinkContext;
}

export const Monogram: FC<MonogramProps> = ({
  name,
  category = 'Other',
  color = '#D4AF7C',
  size = 'md',
  enableLinkPill = true,
  linkContext = 'active',
}) => {
  return (
    <BrandIcon
      name={name}
      category={category}
      color={color}
      size={size}
      enableLinkPill={enableLinkPill}
      linkContext={linkContext}
    />
  );
};
