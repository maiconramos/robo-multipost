'use client';
import { ComponentProps } from 'react';
import { CopilotKit } from '@copilotkit/react-core';

type CopilotProviderProps = Omit<
  ComponentProps<typeof CopilotKit>,
  'useSingleEndpoint' | 'credentials' | 'showDevConsole' | 'enableInspector'
>;

export function CopilotProvider(props: CopilotProviderProps) {
  return (
    <CopilotKit
      {...props}
      useSingleEndpoint={true}
      credentials="include"
      showDevConsole={false}
      enableInspector={false}
    />
  );
}
