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
  ActivityIndicator
} from 'react-native';

// Import from your connection manager
import { 
  connectionManager, 
  ConnectionState, 
  ConnectionMode, 
  MavlinkData 
} from 'lib-mavlink-connect';

const MavlinkComponent: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    connectionManager.getState()
  );
  const [mavlinkData, setMavlinkData] = useState<MavlinkData | null>(null);
  const [showModeSelector, setShowModeSelector] = useState<boolean>(false);
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>('TCP');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const colorScheme = useColorScheme();
  const dataIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connectionModes: ConnectionMode[] = ['TCP', 'UDP'];

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
    } catch (disconnectError) {
      console.error("Error during cleanup disconnect:", disconnectError);
    }
    
    // Update local state
    setIsConnecting(false);
    setMavlinkData(null);
    
    // Show error to user
    Alert.alert('Connection Lost', errorMessage);
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
      }, 10000); // 10 second timeout
      
      const result = await connectionManager.startConnection(selectedMode);
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
        const errorMsg = currentState.error || `${selectedMode} connection failed - server unreachable`;
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
    },
    dropdownText: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 16,
    },
    buttonContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 20,
    },
    button: {
      flex: 1,
      marginHorizontal: 5,
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
    },
    modeOptionSelected: {
      backgroundColor: colorScheme === 'dark' ? '#6200EE' : '#3700B3',
    },
    modeOptionText: {
      color: colorScheme === 'dark' ? '#FFFFFF' : '#000000',
      fontSize: 16,
      textAlign: 'center' as const,
    },
    modeOptionTextSelected: {
      color: '#FFFFFF',
      fontWeight: 'bold' as const,
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
              <Text style={[styles.statusValue, { color: getStatusColor(effectiveStatus) }]}>
                {connectionState.mode}
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
        </TouchableOpacity>

        {/* Connection Buttons */}
        <View style={styles.buttonContainer}>
          <View style={styles.button}>
            <Button
              title={isConnecting ? 'Connecting...' : 'Connect'}
              onPress={handleConnect}
              disabled={isConnecting || effectiveStatus === 'CONNECTED'}
              color={colorScheme === 'dark' ? '#6200EE' : '#3700B3'}
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
      </View>

      {/* Telemetry Section */}
      <View style={styles.telemetryContainer}>
        <Text style={styles.sectionTitle}>MAVLink Telemetry Data</Text>
        
        {isConnecting && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#FFFFFF' : '#000000'} />
            <Text style={styles.loadingText}>Establishing connection...</Text>
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
    </View>
  );
};

export default MavlinkComponent;