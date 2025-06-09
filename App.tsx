import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

import { connectionManager } from 'lib-mavlink-connect';

export default function App() {
  const [serialLog, setSerialLog] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const serialLogRef = useRef<ScrollView>(null);
  const serialDataListener = useRef<any>(null);

  useEffect(() => {
    // Listen for serial data events
    serialDataListener.current = connectionManager.onSerialDataReceived(handleSerialDataReceived);
    
    return () => {
      connectionManager.cleanup().then(() => log('Cleanup complete.'));
      connectionManager.removeSerialDataListener();
      serialDataListener.current?.remove?.();
    };
  }, []);

  // Auto-scroll logs when new entries are added
  useEffect(() => {
    if (serialLogRef.current) {
      setTimeout(() => serialLogRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [serialLog]);

  const checkSerialConnection = async () => {
    try {
      const serialDetails = await connectionManager.getSerialInfo();
      const connected = serialDetails.initialized && serialDetails.status === 'connected';
      setIsConnected(connected);
      return connected;
    } catch (err) {
      setIsConnected(false);
      return false;
    }
  };

  const handleConnect = async () => {
    if (isConnected) {
      // Disconnect
      setIsConnecting(true);
      const result = await connectionManager.stopSerialConnection();
      
      if (result.success) {
        setIsConnected(false);
        log('Serial disconnected');
      } else {
        log(`Disconnect error: ${result.error}`);
      }
      setIsConnecting(false);
    } else {
      // Connect
      setIsConnecting(true);
      log('Connecting to serial device...');
      
      const result = await connectionManager.initSerialConnection();
      
      if (result.success) {
        // Wait a moment then check actual connection status
        setTimeout(async () => {
          const connected = await checkSerialConnection();
          if (connected) {
            log('Serial device connected successfully');
          } else {
            log('Serial initialized but device not detected');
          }
          setIsConnecting(false);
        }, 1000);
      } else {
        log(`Connection failed: ${result.error}`);
        setIsConnecting(false);
      }
    }
  };

  const handleSerialDataReceived = (data: { type: string; size: number }) => {
    log(`Received: ${data.size} bytes (${data.type})`);
    // When data is received, it confirms the device is connected
    if (!isConnected) {
      setIsConnected(true);
    }
  };

  const log = (entry: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${entry}`;
    console.log(entry);
    setSerialLog((prev) => [...prev.slice(-49), logEntry]); // Keep last 50 entries
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    if (!isConnected) {
      Alert.alert('Error', 'Device not connected');
      return;
    }
    const result = await connectionManager.safeSerialOperation(
      
      () => connectionManager.sendTextCommand(message),
      'sendMessage'
    );
    console.log(`Result message: "${message}"`);
    console.log(`Result : "${result}"`);

    if (result.success) {
      log(`Sent: "${message}"`);
      setMessage('');
    } else {
      log(`Send failed: ${result.error}`);
    }
  };

  const handleSendHeartbeat = async () => {
    if (!isConnected) {
      Alert.alert('Error', 'Device not connected');
      return;
    }

    // MAVLink heartbeat message
    const heartbeatBytes = [
      0xFE, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ];
    
    const result = await connectionManager.safeSerialOperation(
      () => connectionManager.sendMavlinkMessage(heartbeatBytes),
      'sendHeartbeat'
    );

    if (result.success) {
      log('Heartbeat sent');
    } else {
      log(`Heartbeat failed: ${result.error}`);
    }
  };

  const getConnectionStatus = () => {
    if (isConnecting) return { text: 'CONNECTING...', color: '#FFA500' };
    if (isConnected) return { text: 'CONNECTED', color: '#4CAF50' };
    return { text: 'DISCONNECTED', color: '#F44336' };
  };

  const status = getConnectionStatus();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Serial Console</Text>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.text}
          </Text>
        </View>
      </View>

      {/* Connection Button */}
      <TouchableOpacity
        style={[
          styles.connectButton,
          { backgroundColor: isConnected ? '#F44336' : '#4CAF50' }
        ]}
        onPress={handleConnect}
        disabled={isConnecting}
      >
        <Text style={styles.connectButtonText}>
          {isConnecting ? 'CONNECTING...' : isConnected ? 'DISCONNECT' : 'CONNECT'}
        </Text>
      </TouchableOpacity>

      {/* Input Section */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>Message:</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter message to send"
          placeholderTextColor="#666"
          value={message}
          onChangeText={setMessage}
          editable={isConnected}
        />
        
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, !isConnected && styles.disabledButton]}
            onPress={handleSendMessage}
            disabled={!isConnected}
          >
            <Text style={styles.buttonText}>SEND MESSAGE</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.actionButton, !isConnected && styles.disabledButton]}
            onPress={handleSendHeartbeat}
            disabled={!isConnected}
          >
            <Text style={styles.buttonText}>HEARTBEAT</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Log Section */}
      <View style={styles.logSection}>
        <Text style={styles.logTitle}>Activity Log</Text>
        <ScrollView 
          ref={serialLogRef}
          style={styles.logScrollView}
          showsVerticalScrollIndicator={false}
        >
          {serialLog.map((entry, idx) => (
            <Text key={idx} style={styles.logEntry}>{entry}</Text>
          ))}
          {serialLog.length === 0 && (
            <Text style={styles.emptyLog}>No activity yet...</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  connectButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 30,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  inputLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#2A2A2A',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#333333',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logSection: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
  },
  logTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  logScrollView: {
    flex: 1,
  },
  logEntry: {
    fontSize: 12,
    color: '#CCCCCC',
    marginBottom: 4,
    lineHeight: 16,
  },
  emptyLog: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginTop: 20,
  },
});