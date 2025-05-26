import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  Button, 
  useColorScheme, 
  TouchableOpacity, 
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList
} from 'react-native';

// Import from your connection manager
import { 
  connectionManager, 
  ConnectionState, 
  ConnectionMode, 
  MavlinkData 
} from 'lib-mavlink-connect';

// Extended types for serial support
type ExtendedConnectionMode = ConnectionMode | 'SERIAL';

interface SerialDevice {
  id: number;
  path: string;
  name: string;
  vendorId?: string;
  productId?: string;
}

interface SerialConnectionConfig {
  deviceId: number;
  path: string;
  baudRate: number;
}

const MavlinkComponent: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    connectionManager.getState()
  );
  const [mavlinkData, setMavlinkData] = useState<MavlinkData | null>(null);
  const [showModeSelector, setShowModeSelector] = useState<boolean>(false);
  const [showSerialConfig, setShowSerialConfig] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<ExtendedConnectionMode>('TCP');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  
  // Serial-specific state
  const [availableDevices, setAvailableDevices] = useState<SerialDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<SerialDevice | null>(null);
  const [baudRate, setBaudRate] = useState<string>('57600');
  const [isLoadingDevices, setIsLoadingDevices] = useState<boolean>(false);
  
  const colorScheme = useColorScheme();
  const dataIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectionModes: ExtendedConnectionMode[] = ['TCP', 'UDP', 'SERIAL'];
  const commonBaudRates = ['9600', '19200', '38400', '57600', '115200', '230400', '460800', '921600'];

  useEffect(() => {
    // Subscribe to connection state changes
    const unsubscribe = connectionManager.subscribe(setConnectionState);

    return () => {
      unsubscribe();
      if (dataIntervalRef.current) {
        clearInterval(dataIntervalRef.current);
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Start/stop telemetry polling based on connection status
    if (connectionState.status === 'CONNECTED') {
      setIsConnecting(false);
      startTelemetryPolling();
    } else {
      stopTelemetryPolling();
      setMavlinkData(null);
      if (connectionState.status === 'DISCONNECTED' || connectionState.status === 'ERROR') {
        setIsConnecting(false);
      }
    }

    return () => {
      stopTelemetryPolling();
    };
  }, [connectionState.status]);

  const startTelemetryPolling = () => {
    if (dataIntervalRef.current) {
      clearInterval(dataIntervalRef.current);
    }

    const fetchMavlinkData = async () => {
      try {
        const data = await connectionManager.getMavlinkData();
        
        // Check if we're getting empty data consistently, which might indicate connection issues
        if (data && Object.keys(data).length === 0) {
          console.log("Receiving empty MAVLink data - connection might be unstable");
        }
        
        setMavlinkData(data);
      } catch (error) {
        console.error("Error fetching MAVLink data:", error);
        // If we can't fetch data, the connection might be broken
        await handleConnectionError("Failed to fetch MAVLink data");
      }
    };

    // Initial fetch
    fetchMavlinkData();
    
    // Set up interval
    dataIntervalRef.current = setInterval(fetchMavlinkData, 1000);
  };

  const stopTelemetryPolling = () => {
    if (dataIntervalRef.current) {
      clearInterval(dataIntervalRef.current);
      dataIntervalRef.current = null;
    }
  };

  const handleConnectionError = async (errorMessage: string) => {
    console.error("Connection error detected:", errorMessage);
    
    // Stop polling
    stopTelemetryPolling();
    
    // Try to disconnect cleanly
    try {
      await connectionManager.stopConnection();
      
      // Additional cleanup for serial connections
      if (selectedMode === 'SERIAL') {
        await connectionManager.cleanup();
      }
    } catch (disconnectError) {
      console.error("Error during cleanup disconnect:", disconnectError);
    }
    
    // Update local state
    setIsConnecting(false);
    setMavlinkData(null);
    
    // Show error to user
    Alert.alert('Connection Lost', errorMessage);
  };

  const scanForSerialDevices = async () => {
    try {
      setIsLoadingDevices(true);
      
      // Get available serial devices
      const deviceInfo = await connectionManager.getSerialDeviceInfo();
      
      // Transform device info to our format
      // This assumes getSerialDeviceInfo returns an array or object with device details
      const devices: SerialDevice[] = [];
      
      if (Array.isArray(deviceInfo)) {
        deviceInfo.forEach((device, index) => {
          devices.push({
            id: device.id || index,
            path: device.path || `/dev/ttyUSB${index}`,
            name: device.name || `Serial Device ${index + 1}`,
            vendorId: device.vendorId,
            productId: device.productId
          });
        });
      }
      //  else if (deviceInfo && typeof deviceInfo === 'object') {
      //   // Handle single device or object format
      //   devices.push({
      //     id: 0,
      //     path: deviceInfo.path || '/dev/ttyUSB0',
      //     name: deviceInfo.name || 'Serial Device',
      //     vendorId: deviceInfo.vendorId,
      //     productId: deviceInfo.productId
      //   });
      // }
      
      // Add some common serial device paths if no devices found
      if (devices.length === 0) {
        const commonPaths = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyACM0', '/dev/ttyACM1'];
        commonPaths.forEach((path, index) => {
          devices.push({
            id: index,
            path,
            name: `Serial Port ${path}`,
          });
        });
      }
      
      setAvailableDevices(devices);
      
      // Auto-select first device if none selected
      if (!selectedDevice && devices.length > 0) {
        setSelectedDevice(devices[0]);
      }
      
    } catch (error) {
      console.error("Error scanning for serial devices:", error);
      Alert.alert('Device Scan Error', 'Failed to scan for serial devices');
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      
      // Clear any existing timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      
      console.log(`Attempting ${selectedMode} connection...`);
      
      // Set a timeout for connection attempt
      connectionTimeoutRef.current = setTimeout(() => {
        if (isConnecting) {
          handleConnectionError(`${selectedMode} connection timeout - server may be unreachable`);
        }
      }, 15000); // 15 second timeout for serial connections
      
      let result;
      
      if (selectedMode === 'SERIAL') {
        // Handle serial connection
        if (!selectedDevice) {
          throw new Error('No serial device selected');
        }
        
        // First start the serial connection mode
        result = await connectionManager.startConnection('SERIAL');
        console.log('Serial connection mode started:', result);
        
        // Then connect to the specific device
        const deviceConnected = await connectionManager.connectSerialDevice(
          selectedDevice.id,
          selectedDevice.path,
          parseInt(baudRate, 10)
        );
        
        console.log('Serial device connection result:', deviceConnected);
        
        if (!deviceConnected) {
          throw new Error(`Failed to connect to serial device ${selectedDevice.path}`);
        }
        
      } else {
        // Handle TCP/UDP connections
        result = await connectionManager.startConnection(selectedMode);
      }
      
      console.log(`${selectedMode} Connection result:`, result);
      
      // Clear timeout since we got a response
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Wait a moment to see if connection actually establishes
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check the actual connection state after a delay
      const currentState = connectionManager.getState();
      console.log("Connection state after attempt:", currentState);
      
      // If we're not actually connected, treat it as an error
      if (currentState.status !== 'CONNECTED') {
        const errorMsg = currentState.error || `${selectedMode} connection failed - unreachable`;
        await handleConnectionError(errorMsg);
        return;
      }
      
      // Verify we can get data
      try {
        const testData = await connectionManager.getMavlinkData();
        if (!testData || Object.keys(testData).length === 0) {
          console.warn("Connected but no MAVLink data available");
        }
      } catch (dataError) {
        console.warn("Connected but cannot fetch MAVLink data:", dataError);
      }
      
      setIsConnecting(false);
      
    } catch (error) {
      console.error("Connection error:", error);
      
      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      setIsConnecting(false);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert('Connection Error', `Failed to connect via ${selectedMode}: ${errorMessage}`);
      
      // Ensure we're in disconnected state
      try {
        await connectionManager.stopConnection();
        if (selectedMode === 'SERIAL') {
          await connectionManager.cleanup();
        }
      } catch (disconnectError) {
        console.error("Error during cleanup:", disconnectError);
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      setIsConnecting(false);
      
      // Clear any timeouts
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      await connectionManager.stopConnection();
      
      // Additional cleanup for serial connections
      if (selectedMode === 'SERIAL') {
        await connectionManager.cleanup();
      }
      
      console.log("Connection stopped");
      
      // Ensure telemetry polling is stopped
      stopTelemetryPolling();
      setMavlinkData(null);
      
    } catch (error) {
      Alert.alert('Disconnection Error', error instanceof Error ? error.message : String(error));
    }
  };

  const handleSendGuidedCommand = async () => {
    try {
      // First verify we're actually connected
      const currentState = connectionManager.getState();
      if (currentState.status !== 'CONNECTED') {
        Alert.alert('Not Connected', 'Cannot send command - not connected to MAVLink server');
        return;
      }
      
      const response = await connectionManager.sendGuidedCommand("TAKEOFF");
      console.log("Guided Command Response:", response);
      Alert.alert('Command Sent', `Response: ${response}`);
    } catch (error) {
      console.error("Error sending guided command:", error);
      
      // If command fails, it might indicate connection issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not connected') || errorMessage.includes('connection')) {
        await handleConnectionError("Connection lost while sending command");
      } else {
        Alert.alert('Command Error', errorMessage);
      }
    }
  };

  const handleSendSerialData = async () => {
    try {
      if (selectedMode !== 'SERIAL' || !selectedDevice) {
        Alert.alert('Error', 'Serial connection required');
        return;
      }
      
      // Example: Send heartbeat packet
      const heartbeatData = [0xFE, 0x09, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x04, 0x08, 0x00, 0x00, 0x03];
      await connectionManager.sendSerialData(selectedDevice.path, heartbeatData);
      
      Alert.alert('Serial Data Sent', 'Heartbeat packet sent successfully');
    } catch (error) {
      console.error("Error sending serial data:", error);
      Alert.alert('Serial Error', error instanceof Error ? error.message : String(error));
    }
  };

  const openSerialConfiguration = () => {
    if (selectedMode === 'SERIAL') {
      scanForSerialDevices();
      setShowSerialConfig(true);
    }
  };

  const formatTelemetryData = (data: MavlinkData | null): string => {
    if (!data) return 'No data available';
    
    try {
      // Check if data is empty object
      if (typeof data === 'object' && Object.keys(data).length === 0) {
        return 'Connected but no MAVLink data received.\nThis may indicate:\n- No vehicle connected to MAVLink server\n- MAVLink server not receiving telemetry\n- Incorrect MAVLink configuration';
      }
      
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return 'Error formatting data';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'CONNECTED':
        return '#4CAF50'; // Green
      case 'CONNECTING':
        return '#FF9800'; // Orange
      case 'ERROR':
        return '#F44336'; // Red
      default:
        return colorScheme === 'dark' ? '#FFFFFF' : '#000000';
    }
  };

  const getModeColor = (mode: ExtendedConnectionMode): string => {
    switch (mode) {
      case 'TCP':
        return '#2196F3'; // Blue
      case 'UDP':
        return '#9C27B0'; // Purple
      case 'SERIAL':
        return '#FF5722'; // Deep Orange
      default:
        return colorScheme === 'dark' ? '#FFFFFF' : '#000000';
    }
  };

  // Determine the effective connection status (considering our local connecting state)
  const getEffectiveStatus = () => {
    if (isConnecting) return 'CONNECTING';
    return connectionState.status;
  };

  const styles = {
    container: {
      flex: 1,
      backgroundColor: colorScheme === 'dark' ? '#121212' : '#FFFFFF',
      padding: 20,
    },
    header: {
      alignItems: 'center' as const,
      marginBottom: 20,
    },
    title: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 22,
      fontWeight: 'bold' as const,
      marginBottom: 10,
    },
    statusContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: 20,
      flexWrap: 'wrap' as const,
      justifyContent: 'center' as const,
    },
    statusText: {
      fontSize: 16,
      marginRight: 10,
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
    },
    statusValue: {
      fontSize: 16,
      fontWeight: 'bold' as const,
    },
    connectionSection: {
      marginBottom: 20,
    },
    sectionTitle: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 18,
      fontWeight: 'bold' as const,
      marginBottom: 10,
    },
    dropdown: {
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#444444' : '#CCCCCC',
      borderRadius: 8,
      padding: 15,
      backgroundColor: colorScheme === 'dark' ? '#333333' : '#FFFFFF',
      marginBottom: 15,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    dropdownText: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 16,
    },
    serialConfigButton: {
      backgroundColor: colorScheme === 'dark' ? '#444444' : '#F0F0F0',
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    serialConfigButtonText: {
      color: getModeColor('SERIAL'),
      fontSize: 12,
      fontWeight: 'bold' as const,
    },
    buttonContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 15,
    },
    button: {
      flex: 1,
      marginHorizontal: 5,
    },
    serialButtonContainer: {
      marginBottom: 15,
    },
    telemetryContainer: {
      flex: 1,
      marginTop: 10,
    },
    telemetryScrollView: {
      backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#F5F5F5',
      borderRadius: 8,
      padding: 15,
      maxHeight: 300,
    },
    telemetryText: {
      color: colorScheme === 'dark' ? '#E0E0E0' : '#333333',
      fontSize: 12,
      fontFamily: 'monospace' as const,
      lineHeight: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    modalContent: {
      backgroundColor: colorScheme === 'dark' ? '#333333' : '#FFFFFF',
      borderRadius: 12,
      padding: 20,
      minWidth: 200,
      maxWidth: 300,
    },
    modalTitle: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 18,
      fontWeight: 'bold' as const,
      marginBottom: 15,
      textAlign: 'center' as const,
    },
    modeOption: {
      padding: 15,
      borderRadius: 8,
      marginBottom: 10,
      backgroundColor: colorScheme === 'dark' ? '#444444' : '#F0F0F0',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    modeOptionSelected: {
      backgroundColor: colorScheme === 'dark' ? '#6200EE' : '#3700B3',
    },
    modeOptionText: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 16,
    },
    modeOptionTextSelected: {
      color: '#FFFFFF',
      fontWeight: 'bold' as const,
    },
    modeIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    modalButtons: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginTop: 20,
    },
    modalButton: {
      flex: 1,
      marginHorizontal: 5,
    },
    loadingContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: 20,
    },
    loadingText: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      marginLeft: 10,
      fontSize: 16,
    },
    // Serial configuration modal styles
    serialModalContent: {
      backgroundColor: colorScheme === 'dark' ? '#333333' : '#FFFFFF',
      borderRadius: 12,
      padding: 20,
      minWidth: 320,
      maxWidth: 400,
      maxHeight: '80%',
    },
    deviceList: {
      maxHeight: 200,
      marginBottom: 15,
    },
    deviceItem: {
      padding: 12,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: colorScheme === 'dark' ? '#444444' : '#F0F0F0',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    deviceItemSelected: {
      borderColor: getModeColor('SERIAL'),
      backgroundColor: colorScheme === 'dark' ? '#4A4A4A' : '#FFF3E0',
    },
    deviceName: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 14,
      fontWeight: 'bold' as const,
    },
    devicePath: {
      color: colorScheme === 'dark' ? '#CCCCCC' : '#666666',
      fontSize: 12,
      marginTop: 2,
    },
    baudRateContainer: {
      marginBottom: 15,
    },
    baudRateRow: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      marginTop: 8,
    },
    baudRateChip: {
      backgroundColor: colorScheme === 'dark' ? '#444444' : '#F0F0F0',
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      margin: 4,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    baudRateChipSelected: {
      backgroundColor: getModeColor('SERIAL'),
      borderColor: getModeColor('SERIAL'),
    },
    baudRateChipText: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 12,
    },
    baudRateChipTextSelected: {
      color: '#FFFFFF',
      fontWeight: 'bold' as const,
    },
    customBaudRate: {
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#444444' : '#CCCCCC',
      borderRadius: 8,
      padding: 10,
      backgroundColor: colorScheme === 'dark' ? '#444444' : '#FFFFFF',
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      marginTop: 8,
    },
    refreshButton: {
      backgroundColor: getModeColor('SERIAL'),
      borderRadius: 8,
      padding: 10,
      alignItems: 'center' as const,
      marginBottom: 15,
    },
    refreshButtonText: {
      color: '#FFFFFF',
      fontWeight: 'bold' as const,
    },
  };

  const effectiveStatus = getEffectiveStatus();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>React Native MAVLink</Text>
        
        {/* Connection Status */}
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>Status:</Text>
          <Text style={[styles.statusValue, { color: getStatusColor(effectiveStatus) }]}>
            {effectiveStatus}
          </Text>
          {connectionState.mode && (
            <>
              <Text style={[styles.statusText, { marginLeft: 15 }]}>Mode:</Text>
              <Text style={[styles.statusValue, { color: getModeColor(selectedMode) }]}>
                {connectionState.mode}
              </Text>
            </>
          )}
          {selectedMode === 'SERIAL' && selectedDevice && (
            <>
              <Text style={[styles.statusText, { marginLeft: 15 }]}>Device:</Text>
              <Text style={[styles.statusValue, { color: getModeColor('SERIAL'), fontSize: 12 }]}>
                {selectedDevice.path}
              </Text>
            </>
          )}
        </View>

        {/* Error Display */}
        {connectionState.error && (
          <Text style={[styles.statusText, { color: '#F44336', textAlign: 'center' }]}>
            {connectionState.error}
          </Text>
        )}
      </View>

      {/* Connection Section */}
      <View style={styles.connectionSection}>
        <Text style={styles.sectionTitle}>Connection Settings</Text>
        
        {/* Mode Selector Dropdown */}
        <TouchableOpacity 
          style={styles.dropdown} 
          onPress={() => setShowModeSelector(true)}
          disabled={isConnecting || effectiveStatus === 'CONNECTED'}
        >
          <Text style={styles.dropdownText}>
            Connection Mode: {selectedMode}
          </Text>
          {selectedMode === 'SERIAL' && (
            <TouchableOpacity
              style={styles.serialConfigButton}
              onPress={openSerialConfiguration}
              disabled={isConnecting || effectiveStatus === 'CONNECTED'}
            >
              <Text style={styles.serialConfigButtonText}>Configure</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Serial Device Info */}
        {selectedMode === 'SERIAL' && selectedDevice && (
          <View style={[styles.dropdown, { marginBottom: 15, backgroundColor: 'transparent', borderColor: getModeColor('SERIAL') }]}>
            <View>
              <Text style={[styles.dropdownText, { fontSize: 14, fontWeight: 'bold' }]}>
                {selectedDevice.name}
              </Text>
              <Text style={[styles.dropdownText, { fontSize: 12, opacity: 0.7 }]}>
                {selectedDevice.path} @ {baudRate} baud
              </Text>
            </View>
          </View>
        )}

        {/* Connection Buttons */}
        <View style={styles.buttonContainer}>
          <View style={styles.button}>
            <Button
              title={isConnecting ? 'Connecting...' : 'Connect'}
              onPress={handleConnect}
              disabled={isConnecting || effectiveStatus === 'CONNECTED'}
              color={getModeColor(selectedMode)}
            />
          </View>
          <View style={styles.button}>
            <Button
              title="Disconnect"
              onPress={handleDisconnect}
              disabled={effectiveStatus !== 'CONNECTED' && !isConnecting}
              color={colorScheme === 'dark' ? '#CF6679' : '#B00020'}
            />
          </View>
        </View>

        {/* Send Command Button */}
        <Button
          title="Send Guided Command (TAKEOFF)"
          onPress={handleSendGuidedCommand}
          disabled={effectiveStatus !== 'CONNECTED'}
          color={colorScheme === 'dark' ? '#03DAC6' : '#018786'}
        />

        {/* Serial Data Button */}
        {selectedMode === 'SERIAL' && (
          <View style={styles.serialButtonContainer}>
            <Button
              title="Send Serial Data (Heartbeat)"
              onPress={handleSendSerialData}
              disabled={effectiveStatus !== 'CONNECTED'}
              color={getModeColor('SERIAL')}
            />
          </View>
        )}
      </View>

      {/* Telemetry Section */}
      <View style={styles.telemetryContainer}>
        <Text style={styles.sectionTitle}>MAVLink Telemetry Data</Text>
        
        {isConnecting && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={getModeColor(selectedMode)} />
            <Text style={styles.loadingText}>Establishing {selectedMode} connection...</Text>
          </View>
        )}

        {effectiveStatus === 'CONNECTED' && (
          <ScrollView style={styles.telemetryScrollView} showsVerticalScrollIndicator={true}>
            <Text style={styles.telemetryText}>
              {formatTelemetryData(mavlinkData)}
            </Text>
          </ScrollView>
        )}

        {(effectiveStatus === 'DISCONNECTED' || effectiveStatus === 'ERROR') && !isConnecting && (
          <View style={styles.telemetryScrollView}>
            <Text style={[styles.telemetryText, { textAlign: 'center', fontStyle: 'italic' }]}>
              Connect to start receiving telemetry data
            </Text>
          </View>
        )}
      </View>

      {/* Mode Selection Modal */}
      <Modal
        visible={showModeSelector}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowModeSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Connection Mode</Text>
            
            {connectionModes.map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.modeOption,
                  selectedMode === mode && styles.modeOptionSelected
                ]}
                onPress={() => setSelectedMode(mode)}
              >
                <Text style={[
                  styles.modeOptionText,
                  selectedMode === mode && styles.modeOptionTextSelected
                ]}>
                  {mode}
                </Text>
                <View style={[styles.modeIndicator, { backgroundColor: getModeColor(mode) }]} />
              </TouchableOpacity>
            ))}

            <View style={styles.modalButtons}>
              <View style={styles.modalButton}>
                <Button
                  title="Cancel"
                  onPress={() => setShowModeSelector(false)}
                  color={colorScheme === 'dark' ? '#CF6679' : '#B00020'}
                />
              </View>
              <View style={styles.modalButton}>
                <Button
                  title="Select"
                  onPress={() => setShowModeSelector(false)}
                  color={colorScheme === 'dark' ? '#6200EE' : '#3700B3'}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Serial Configuration Modal */}
      <Modal
        visible={showSerialConfig}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSerialConfig(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.serialModalContent}>
            <Text style={styles.modalTitle}>Serial Configuration</Text>
            
            {/* Refresh Devices Button */}
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={scanForSerialDevices}
              disabled={isLoadingDevices}
            >
              {isLoadingDevices ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={[styles.refreshButtonText, { marginLeft: 8 }]}>Scanning...</Text>
                </View>
              ) : (
                <Text style={styles.refreshButtonText}>Refresh Devices</Text>
              )}
            </TouchableOpacity>

            {/* Device Selection */}
            <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 8 }]}>
              Select Device:
            </Text>
            
            <ScrollView style={styles.deviceList} showsVerticalScrollIndicator={true}>
              {availableDevices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  style={[
                    styles.deviceItem,
                    selectedDevice?.id === device.id && styles.deviceItemSelected
                  ]}
                  onPress={() => setSelectedDevice(device)}
                >
                  <Text style={styles.deviceName}>{device.name}</Text>
                  <Text style={styles.devicePath}>{device.path}</Text>
                  {device.vendorId && device.productId && (
                    <Text style={styles.devicePath}>
                      VID: {device.vendorId} PID: {device.productId}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
              
              {availableDevices.length === 0 && !isLoadingDevices && (
                <View style={styles.deviceItem}>
                  <Text style={[styles.deviceName, { textAlign: 'center', fontStyle: 'italic' }]}>
                    No devices found. Tap refresh to scan again.
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Baud Rate Selection */}
            <View style={styles.baudRateContainer}>
              <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 8 }]}>
                Baud Rate:
              </Text>
              
              <View style={styles.baudRateRow}>
                {commonBaudRates.map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    style={[
                      styles.baudRateChip,
                      baudRate === rate && styles.baudRateChipSelected
                    ]}
                    onPress={() => setBaudRate(rate)}
                  >
                    <Text style={[
                      styles.baudRateChipText,
                      baudRate === rate && styles.baudRateChipTextSelected
                    ]}>
                      {rate}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Custom Baud Rate Input */}
              <TextInput
                style={styles.customBaudRate}
                placeholder="Custom baud rate..."
                placeholderTextColor={colorScheme === 'dark' ? '#999999' : '#666666'}
                value={baudRate}
                onChangeText={setBaudRate}
                keyboardType="numeric"
              />
            </View>

            {/* Modal Buttons */}
            <View style={styles.modalButtons}>
              <View style={styles.modalButton}>
                <Button
                  title="Cancel"
                  onPress={() => setShowSerialConfig(false)}
                  color={colorScheme === 'dark' ? '#CF6679' : '#B00020'}
                />
              </View>
              <View style={styles.modalButton}>
                <Button
                  title="Apply"
                  onPress={() => {
                    setShowSerialConfig(false);
                    console.log('Serial config applied:', selectedDevice, baudRate);
                  }}
                  disabled={!selectedDevice || !baudRate}
                  color={getModeColor('SERIAL')}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default MavlinkComponent;