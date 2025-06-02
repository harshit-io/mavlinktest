import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Button,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
  Dimensions,
} from 'react-native';

import {
  initSerialConnection,
  stopSerialConnection,
  sendSerialData,
  sendTextCommand,
  sendMavlinkMessage,
  isSerialInitialized,
  getConnectionStatus,
  getSerialInfo,
  addEventListener,
  removeEventListener,
  onSerialDataReceived,
  removeSerialDataListener,
  stringToByteArray,
  hexToByteArray,
  safeSerialOperation,
  cleanup,
} from 'lib-mavlink-connect';

// For Android logcat integration
import { NativeModules } from 'react-native';

// Custom hook for logcat (Android only)
const useLogcat = (enabled: boolean) => {
  const [logs, setLogs] = useState<string[]>([]);
  
  useEffect(() => {
    if (!enabled) return;
    
    // This would require a native module to read logcat
    // For now, we'll simulate with console logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = (...args) => {
      const message = args.join(' ');
      setLogs(prev => [...prev.slice(-99), `[LOG] ${new Date().toLocaleTimeString()}: ${message}`]);
      originalLog(...args);
    };
    
    console.error = (...args) => {
      const message = args.join(' ');
      setLogs(prev => [...prev.slice(-99), `[ERROR] ${new Date().toLocaleTimeString()}: ${message}`]);
      originalError(...args);
    };
    
    console.warn = (...args) => {
      const message = args.join(' ');
      setLogs(prev => [...prev.slice(-99), `[WARN] ${new Date().toLocaleTimeString()}: ${message}`]);
      originalWarn(...args);
    };
    
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, [enabled]);
  
  return logs;
};

export default function App() {
  const [serialLog, setSerialLog] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [hexMessage, setHexMessage] = useState('FE0900000000000000000000000000');
  const [initialized, setInitialized] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({
    serialInitialized: false,
    controllerInitialized: false,
  });
  const [serialInfo, setSerialInfo] = useState({
    initialized: false,
    status: 'disconnected' as 'connected' | 'disconnected',
  });
  const [showLogcat, setShowLogcat] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  
  const serialLogRef = useRef<ScrollView>(null);
  const logcatRef = useRef<ScrollView>(null);
  const logcatLogs = useLogcat(showLogcat);
  const serialDataListener = useRef<any>(null);

  useEffect(() => {
    initSerial();
    
    // Listen for serial data events using the enhanced helper
    serialDataListener.current = onSerialDataReceived(handleSerialDataReceived);
    
    // Check connection status periodically
    const statusInterval = setInterval(checkConnectionStatus, 2000);
    
    return () => {
      cleanup().then(() => log('Cleanup complete.'));
      removeSerialDataListener();
      clearInterval(statusInterval);
      serialDataListener.current?.remove?.();
    };
  }, []);

  // Auto-scroll logs when new entries are added
  useEffect(() => {
    if (autoScroll && serialLogRef.current) {
      setTimeout(() => serialLogRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [serialLog, autoScroll]);

  useEffect(() => {
    if (autoScroll && logcatRef.current && showLogcat) {
      setTimeout(() => logcatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [logcatLogs, autoScroll, showLogcat]);

  const initSerial = async () => {
    const result = await initSerialConnection();
    
    if (result.success) {
      setInitialized(true);
      log(`Serial initialization complete: ${result.message}`);
    } else {
      log(`Init failed: ${result.error}`);
      console.error('Serial init error:', result.error);
    }
    
    await checkConnectionStatus();
  };

  const checkConnectionStatus = async () => {
    try {
      const status = await getConnectionStatus();
      setConnectionStatus(status);
      
      const isInit = await isSerialInitialized();
      setInitialized(isInit);
      
      const serialDetails = await getSerialInfo();
      setSerialInfo(serialDetails);
    } catch (err: any) {
      console.error('Status check error:', err);
    }
  };

  const handleSerialDataReceived = (data: { type: string; size: number }) => {
    try {
      log(`Serial data received: ${data.size} bytes (type: ${data.type})`);
      console.log('Serial data event:', data);
    } catch (err: any) {
      log(`Received data event: ${JSON.stringify(data)}`);
      console.log('Serial data:', data);
    }
  };

  const log = (entry: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${entry}`;
    console.log(entry);
    setSerialLog((prev) => [...prev.slice(-99), logEntry]); // Keep last 100 entries
  };

  const handleStart = async () => {
    if (!initialized) {
      await initSerial();
    } else {
      log('Serial already initialized');
    }
  };

  const handleStop = async () => {
    const result = await stopSerialConnection();
    
    if (result.success) {
      setInitialized(false);
      log(`Serial connection stopped: ${result.message}`);
    } else {
      log(`Stop error: ${result.error}`);
      console.error('Stop error:', result.error);
    }
    
    await checkConnectionStatus();
  };

  const handleSendText = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message to send');
      return;
    }

    if (!initialized) {
      Alert.alert('Error', 'Serial not initialized. Please start serial first.');
      return;
    }

    const result = await safeSerialOperation(
      () => sendTextCommand(message),
      'sendTextCommand'
    );

    if (result.success) {
      log(`Sent text: "${message}" (${stringToByteArray(message).length} bytes)`);
      console.log('Sent text successfully:', result.data);
      setMessage('');
    } else {
      log(`Send text error: ${result.error}`);
    }
  };

  const handleSendRawBytes = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message to send');
      return;
    }

    if (!initialized) {
      Alert.alert('Error', 'Serial not initialized. Please start serial first.');
      return;
    }

    const bytes = stringToByteArray(message);
    const result = await safeSerialOperation(
      () => sendSerialData(bytes),
      'sendSerialData'
    );

    if (result.success) {
      log(`Sent raw bytes: ${message} (${bytes.length} bytes) - ${bytes.join(',')}`);
      console.log('Sent bytes:', bytes);
      setMessage('');
    } else {
      log(`Send raw bytes error: ${result.error}`);
    }
  };

  const handleSendHex = async () => {
    if (!hexMessage.trim()) {
      Alert.alert('Error', 'Please enter hex data to send');
      return;
    }

    if (!initialized) {
      Alert.alert('Error', 'Serial not initialized. Please start serial first.');
      return;
    }

    try {
      const hexBytes = hexToByteArray(hexMessage.replace(/\s+/g, ''));
      const result = await safeSerialOperation(
        () => sendMavlinkMessage(hexBytes),
        'sendMavlinkMessage'
      );

      if (result.success) {
        log(`Sent hex data: ${hexBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        console.log('Sent hex bytes:', hexBytes);
      } else {
        log(`Send hex error: ${result.error}`);
      }
    } catch (e: any) {
      log(`Hex parsing error: ${e.message}`);
      console.error('Hex parsing error:', e);
    }
  };

  const handleSendTestHeartbeat = async () => {
    if (!initialized) {
      Alert.alert('Error', 'Serial not initialized. Please start serial first.');
      return;
    }

    // MAVLink heartbeat message example
    const heartbeatBytes = [
      0xFE, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    
    const result = await safeSerialOperation(
      () => sendMavlinkMessage(heartbeatBytes),
      'sendTestHeartbeat'
    );

    if (result.success) {
      log(`Sent test heartbeat: ${heartbeatBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    } else {
      log(`Send test heartbeat error: ${result.error}`);
    }
  };

  const clearLogs = () => {
    setSerialLog([]);
  };

  const getStatusColor = (status: boolean) => status ? '#4CAF50' : '#F44336';
  const getStatusText = (status: boolean) => status ? 'OK' : 'NOT OK';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Enhanced Serial Test Console</Text>

      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Connection Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Serial Initialized:</Text>
          <Text style={[styles.statusValue, { color: getStatusColor(connectionStatus.serialInitialized) }]}>
            {getStatusText(connectionStatus.serialInitialized)}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Controller:</Text>
          <Text style={[styles.statusValue, { color: getStatusColor(connectionStatus.controllerInitialized) }]}>
            {getStatusText(connectionStatus.controllerInitialized)}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Serial Status:</Text>
          <Text style={[styles.statusValue, { color: getStatusColor(serialInfo.status === 'connected') }]}>
            {serialInfo.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Control Buttons */}
      <View style={styles.buttonRow}>
        <Button
          title={initialized ? 'Stop Serial' : 'Start Serial'}
          onPress={initialized ? handleStop : handleStart}
          color={initialized ? '#F44336' : '#4CAF50'}
        />
        <Button title="Refresh Status" onPress={checkConnectionStatus} />
      </View>

      {/* Text Message Input */}
      <Text style={styles.inputLabel}>Text Message:</Text>
      <TextInput
        style={styles.input}
        placeholder="Message to send"
        placeholderTextColor="#888"
        value={message}
        onChangeText={setMessage}
      />
      
      <View style={styles.buttonRow}>
        <Button title="Send as Text" onPress={handleSendText} disabled={!initialized} />
        <Button title="Send as Raw Bytes" onPress={handleSendRawBytes} disabled={!initialized} />
      </View>

      {/* Hex Message Input */}
      <Text style={styles.inputLabel}>Hex Data (no spaces needed):</Text>
      <TextInput
        style={styles.input}
        placeholder="FE0900000000000000000000000000"
        placeholderTextColor="#888"
        value={hexMessage}
        onChangeText={setHexMessage}
      />
      
      <View style={styles.buttonRow}>
        <Button title="Send Hex Data" onPress={handleSendHex} disabled={!initialized} />
        <Button title="Send Test Heartbeat" onPress={handleSendTestHeartbeat} disabled={!initialized} />
      </View>

      {/* Log Controls */}
      <View style={styles.logControls}>
        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>Show Logcat</Text>
          <Switch
            value={showLogcat}
            onValueChange={setShowLogcat}
            thumbColor={showLogcat ? '#4CAF50' : '#888'}
            trackColor={{ false: '#333', true: '#4CAF5050' }}
          />
        </View>
        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>Auto Scroll</Text>
          <Switch
            value={autoScroll}
            onValueChange={setAutoScroll}
            thumbColor={autoScroll ? '#4CAF50' : '#888'}
            trackColor={{ false: '#333', true: '#4CAF5050' }}
          />
        </View>
        <Button title="Clear Logs" onPress={clearLogs} color="#FF9800" />
      </View>

      {/* Serial Log */}
      <View style={[styles.logContainer, !showLogcat && styles.logContainerFull]}>
        <Text style={styles.logTitle}>Serial Log ({serialLog.length} entries):</Text>
        <ScrollView 
          ref={serialLogRef}
          style={styles.logScrollView}
          nestedScrollEnabled={true}
        >
          {serialLog.map((entry, idx) => (
            <Text key={idx} style={styles.logEntry}>{entry}</Text>
          ))}
          {serialLog.length === 0 && (
            <Text style={styles.logEntry}>No serial logs yet...</Text>
          )}
        </ScrollView>
      </View>

      {/* Logcat */}
      {showLogcat && (
        <View style={styles.logContainer}>
          <Text style={styles.logTitle}>Logcat ({logcatLogs.length} entries):</Text>
          <ScrollView 
            ref={logcatRef}
            style={styles.logScrollView}
            nestedScrollEnabled={true}
          >
            {logcatLogs.map((entry, idx) => (
              <Text key={idx} style={[
                styles.logEntry,
                entry.includes('[ERROR]') && styles.errorLog,
                entry.includes('[WARN]') && styles.warnLog,
              ]}>{entry}</Text>
            ))}
            {logcatLogs.length === 0 && (
              <Text style={styles.logEntry}>No logcat entries yet...</Text>
            )}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#121212',
    flexGrow: 1,
    minHeight: Dimensions.get('window').height,
  },
  heading: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  statusTitle: {
    fontSize: 16,
    color: '#FFA500',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusLabel: {
    color: '#DDDDDD',
    fontSize: 14,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  inputLabel: {
    color: '#FFA500',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    fontSize: 16,
  },
  logControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    backgroundColor: '#1E1E1E',
    padding: 8,
    borderRadius: 8,
  },
  switchContainer: {
    alignItems: 'center',
  },
  switchLabel: {
    color: '#DDDDDD',
    fontSize: 12,
    marginBottom: 4,
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
    minHeight: 200,
  },
  logContainerFull: {
    minHeight: 400,
  },
  logTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFA500',
    marginBottom: 8,
  },
  logScrollView: {
    flex: 1,
  },
  logEntry: {
    fontSize: 12,
    color: '#DDDDDD',
    marginBottom: 2,
    lineHeight: 16,
  },
  errorLog: {
    color: '#FF6B6B',
  },
  warnLog: {
    color: '#FFD93D',
  },
});