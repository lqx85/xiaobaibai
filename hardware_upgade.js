var namePrefix = "xiaob";

const SVR_CHR_OTA_CONTROL_NOP = 0;
const SVR_CHR_OTA_CONTROL_REQUEST = 1;
const SVR_CHR_OTA_CONTROL_REQUEST_ACK = 2;
const SVR_CHR_OTA_CONTROL_REQUEST_NAK = 3;
const SVR_CHR_OTA_CONTROL_DONE = 4;
const SVR_CHR_OTA_CONTROL_DONE_ACK = 5;
const SVR_CHR_OTA_CONTROL_DONE_NAK = 6;

const UUID_SERVICE = "d6f1d96d-594c-4c53-b1c6-244a1dfde6d8";
const OTA_DATA_UUID = "23408888-1f40-4cd8-9b89-ca8d45f8a5b0";
const OTA_CONTROL_UUID = "7ad671aa-21c0-46a4-b722-270e3ae3d830";
const BLE_MTU = 256;

let bluetoothDevice;
let characteristic_data, characteristic_ctr;
const logEl = document.getElementById("log");
const bleStateContainer = document.getElementById("bleState");
const button_connect = document.getElementById("connectBleButton");
const button_disconnect = document.getElementById("disconnectBleButton");
const button_upload = document.getElementById("upload");
const otafile = document.getElementById("otafile");

const packet_size = BLE_MTU - 3;

class Queue {
  constructor() {
    this.items = {};
    this.frontIndex = 0;
    this.backIndex = 0;
  }
  push(item) {
    this.items[this.backIndex] = item;
    this.backIndex++;
    console.log("push: " + item);
  }
  get() {
    if (this.frontIndex < this.backIndex) {
      const item = this.items[this.frontIndex];
      delete this.items[this.frontIndex];
      this.frontIndex++;
      console.log("get: " + item);
      return item;
    }
    else {
      return null;
    }
  }
}

const ctr_cmd = new Queue();


// 链接蓝牙设备
button_connect.addEventListener("click", (event) => {
  event.preventDefault();
  if (isWebBluetoothEnabled()) {
    onButtonConnectClick();
  }
});

// 断开蓝牙设备
button_disconnect.addEventListener("click", (event) => {
  event.preventDefault();
  bluetoothDevice.gatt.disconnect();
});

// 上传固件
button_upload.addEventListener("click", async (event) => {
  event.preventDefault();

  characteristic_ctr.addEventListener("characteristicvaluechanged", event => {
    // Handle the notification event.
    let ctr_val = event.target.value.getUint8(0);
    console.log("characteristic_ctr value: " + ctr_val);

    if (ctr_val == SVR_CHR_OTA_CONTROL_REQUEST_ACK) {
      ctr_cmd.push("ack");
      console.log("Xiaob:OTA request acknowledged.");
    } else if (ctr_val == SVR_CHR_OTA_CONTROL_REQUEST_NAK) {
      console.log("Xiaob:OTA request NOT acknowledged.");
      ctr_cmd.push("nak");
      characteristic_ctr.stopNotifications();
    }
    else if (ctr_val == SVR_CHR_OTA_CONTROL_DONE_ACK) {
      console.log("Xiaob:OTA done acknowledged.");
      ctr_cmd.push("ack");
      characteristic_ctr.stopNotifications();
    }
    else if (ctr_val == SVR_CHR_OTA_CONTROL_DONE_NAK) {
      console.log("Xiaob:OTA done NOT acknowledged.");
      ctr_cmd.push("nak");
      characteristic_ctr.stopNotifications();
    }
    else {
      console.log("Notification received: sender: {sender}, data: {data}");
    }
  });

  characteristic_ctr.startNotifications();

  if (otafile.files.length == 0) {
    alert("No file selected!");
    return;
  }

  // write the packet size to OTA Data
  consoleWrite("Sending packet size = " + packet_size);
  console.log("Sending packet size = " + packet_size);
  // Write to the characteristic.
  await characteristic_data.writeValueWithResponse(IntToArrayBuffer(packet_size));

  // write the request OP code to OTA Control
  consoleWrite("Sending OTA request.");
  console.log("Sending OTA request.");
  await characteristic_ctr.writeValue(IntToArrayBuffer(SVR_CHR_OTA_CONTROL_REQUEST));

  console.log("delay_ms(500)");
  delay_ms(500);

  if (ctr_cmd.get() == "ack") {

    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = reader.result;
      console.log("file size: " + buffer.byteLength);
      for (let i = 0; i < buffer.byteLength; i += packet_size) {
        consoleWrite("Sending packet " + i + " / " + file.size);
        console.log("Sending packet " + i + " / " + file.size);
        const chunk = buffer.slice(i, i + packet_size);
        await characteristic_data.writeValueWithResponse(chunk);
        // console.log(new TextDecoder("utf-8").decode(chunk));
      }

      // write done OP code to OTA Control
      consoleWrite("Sending OTA done.");
      await characteristic_ctr.writeValueWithResponse(IntToArrayBuffer(SVR_CHR_OTA_CONTROL_DONE));

      // delay_ms(100);
      if (ctr_cmd.get() == "ack") {
        consoleWrite("OTA successful!");
      }
    };

    const file = otafile.files[0];
    reader.readAsArrayBuffer(file);

  }
  else {
    consoleWrite("xiaob did not acknowledge the OTA request.");
  }
});

// 输出窗口日志
function consoleWrite(text, color) {
  const el = document.createElement("div");
  var now = new Date();
  el.innerText = now.toLocaleString() + "->" + text;
  el.style.color = color || "white";
  logEl.append(el);
  if (logEl.children.length > 10) {
    logEl.removeChild(logEl.children[0]);
  }
}

// 判断浏览器是否支持蓝牙设备
function isWebBluetoothEnabled() {
  if (!navigator.bluetooth) {
    console.log("Web Bluetooth API is not available in this browser!");
    bleStateContainer.innerHTML = "当前浏览器不支持蓝牙设备，请更换浏览器!";
    window.alert("当前浏览器不支持蓝牙设备，请更换浏览器!");
    return false
  }
  console.log("Web Bluetooth API supported in this browser.");
  return true
}

// 断开蓝牙设备
async function onDisconnected() {
  bleStateContainer.innerHTML = "未链接";
  bleStateContainer.style.color = "#d13a30";
}

// 链接蓝牙设备
async function onButtonConnectClick() {
  try {
    logEl.innerHTML = "";

    consoleWrite("Requesting Bluetooth Device...", "grey");
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [UUID_SERVICE] },
        { namePrefix: namePrefix }
      ],
    });
    bluetoothDevice.addEventListener("gattserverdisconnected", onDisconnected);

    consoleWrite("Connecting to GATT Server...", "grey");
    const server = await bluetoothDevice.gatt.connect();
    consoleWrite("Getting Service...", "grey");
    const service = await server.getPrimaryService(UUID_SERVICE);
    consoleWrite("Getting Characteristic...", "grey");

    characteristic_data = await service.getCharacteristic(OTA_DATA_UUID);
    consoleWrite("Getting Characteristic...", "grey");
    // characteristic_data.addEventListener();

    characteristic_ctr = await service.getCharacteristic(OTA_CONTROL_UUID);

    consoleWrite("Connected.", "grey");
    // characteristic_ctr.addEventListener(
    //   "characteristicvaluechanged",
    //   handleNotifications
    // );
    bluetoothDevice.on;
    bleStateContainer.innerHTML = "已链接";
    bleStateContainer.style.color = "green";

  } catch (error) {
    console.error(error);
    consoleWrite(error.stack, "#FF878D");
    consoleWrite(error.name + ": " + error.message, "#FF878D");
  }
}

// int转byte[]，低字节在前（低字节序）
function IntToArrayBuffer(num) {
  const buffer = new ArrayBuffer(1);
  const view = new Uint8Array(buffer);
  view[0] = num;
  return buffer;
}

// string转arraybuffer，低字节在前（低字节序）
function stringToArrayBuffer(str) {
  var enc = new TextEncoder(); // always utf-8
  return enc.encode(str).buffer;
}

function delay_ms(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
