import React, { createContext, useContext } from 'react';
import useBLE, { BluetoothLowEnergyApi } from '../useBLE';

const BLEContext = createContext<BluetoothLowEnergyApi | null>(null);

export const BLEProvider = ({ children }: { children: React.ReactNode }) => {
  const ble = useBLE();
  return <BLEContext.Provider value={ble}>{children}</BLEContext.Provider>;
};

export const useBLEContext = (): BluetoothLowEnergyApi => {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error('useBLEContext must be used within BLEProvider');
  }
  return context;
};

