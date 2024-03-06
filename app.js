var namePrefix = 'xiaob';
const UUID_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UUID_CHAR_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // Write
const UUID_CHAR_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // Notify
const BLE_MTU = 20;

let bluetoothDevice;
let characteristic_tx, characteristic_rx;
const logEl = document.getElementById("log");
let rx_buffer = "";

const bleStateContainer = document.getElementById('bleState');
const button_connect = document.getElementById('connectBleButton');
const button_disconnect = document.getElementById('disconnectBleButton');
const chart_altitude = document.getElementById('disconnectBleButton');

button_connect.addEventListener('click', async (event) => {
  event.preventDefault();

  // 判断浏览器是否支持蓝牙
  if (!navigator.bluetooth) {
    bleStateContainer.innerHTML = "当前浏览器不支持蓝牙设备，请更换浏览器!";
    window.alert("当前浏览器不支持蓝牙设备，请更换浏览器!");
    return;
  }

  try {
    logEl.innerHTML = "";

    consoleWrite("Requesting Bluetooth Device...", "grey");
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [UUID_SERVICE] },
        { namePrefix: namePrefix }
      ],
    });
    bluetoothDevice.addEventListener('gattserverdisconnected', () => {
      bleStateContainer.innerHTML = "未链接";
      bleStateContainer.style.color = '#d13a30';
    });

    consoleWrite("Connecting to GATT Server...", "grey");
    const server = await bluetoothDevice.gatt.connect();
    consoleWrite("Getting Service...", "grey");
    const service = await server.getPrimaryService(UUID_SERVICE);
    consoleWrite("Getting Characteristic...", "grey");
    characteristic_tx = await service.getCharacteristic(UUID_CHAR_TX);
    consoleWrite("Getting Characteristic...", "grey");
    characteristic_rx = await service.getCharacteristic(UUID_CHAR_RX);
    await characteristic_rx.startNotifications();
    consoleWrite("Connected.", "grey");
    characteristic_rx.addEventListener("characteristicvaluechanged", async (event) => {
      try {
        var text = new TextDecoder().decode(event.target.value);
        // console.log("chunk: " + text);
        if (text.indexOf('\n') >= 0) {
          rx_buffer += text;
          OnReceiveData(rx_buffer);
          // consoleWrite(rx_buffer);
          // console.log(rx_buffer);
          rx_buffer = "";
        } else {
          rx_buffer += text;
        }
      } catch (error) {
        console.error(error);
        consoleWrite(error.stack, "#FF878D");
        consoleWrite(error.name + ': ' + error.message, "#FF878D");
      }
    });
    bluetoothDevice.on;
    bleStateContainer.innerHTML = "已链接";
    bleStateContainer.style.color = 'green';
  } catch (error) {
    console.error(error);
    consoleWrite(error.stack, "#FF878D");
    consoleWrite(error.name + ': ' + error.message, "#FF878D");
  }

});

button_disconnect.addEventListener('click', async (event) => {
  event.preventDefault();
  bluetoothDevice.gatt.disconnect();
});

function consoleWrite(text, color) {
  const el = document.createElement("div");
  /*var now = new Date();
  el.innerText = now.toLocaleString() + "->" + text;*/
  el.innerText = text;
  el.style.color = color || "white";
  logEl.append(el);
  if (logEl.children.length > 10) {
    logEl.removeChild(logEl.children[0]);
  }
}

async function sendMessage(msg) {
  console.log("send message: " + msg);
  if (!characteristic_tx) {
    return;
  }

  const arrayBuffe = new TextEncoder().encode(msg + '\n');

  consoleWrite(msg, "#8787FF");
  try {
    for (let i = 0; i < arrayBuffe.length; i += BLE_MTU) {
      await characteristic_tx.writeValueWithoutResponse(arrayBuffe.slice(i, i + BLE_MTU));
    }
  } catch (error) {
    console.error(error);
    consoleWrite(error.stack, "#FF878D");
    consoleWrite(error.name + ': ' + error.message, "#FF878D");
  }
}

function delay_ms(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
