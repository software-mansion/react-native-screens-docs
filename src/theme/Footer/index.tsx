import React, { useEffect } from 'react';
import { Footer as TRexFooter } from '@swmansion/t-rex-ui';

const PRIVACY_POLICY_URL = 'https://swmansion.com/privacy/policy/';
const PRIVACY_POLICY_LEAD = ' Read about our ';
const PRIVACY_POLICY_LABEL = 'Privacy Policy';

export default function Footer(props: React.ComponentProps<typeof TRexFooter>) {
  useEffect(() => {
    const paragraph = document.querySelector('footer .footer__copyright p');
    if (!paragraph || paragraph.querySelector('[data-privacy-policy]')) {
      return;
    }

    paragraph.appendChild(document.createTextNode(PRIVACY_POLICY_LEAD));

    const link = document.createElement('a');
    link.href = PRIVACY_POLICY_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.privacyPolicy = '';
    link.textContent = PRIVACY_POLICY_LABEL;

    paragraph.appendChild(link);
    paragraph.appendChild(document.createTextNode('.'));
  }, []);

  return <TRexFooter {...props} />;
}
