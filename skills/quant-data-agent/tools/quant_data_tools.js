/**
 * 量化金融数据工具集
 * 提供A股、期货、基金等实时数据获取
 */

const axios = require('axios');

async function getStockRealtime(symbol) {
  try {
    const response = await axios.get('http://localhost:3000/api/astock/realtime/' + (symbol || '000001'), { timeout: 10000 });
    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function getIndexRealtime() {
  try {
    const response = await axios.get('http://localhost:3000/api/astock/index', { timeout: 10000 });
    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function getConceptBoard() {
  try {
    const response = await axios.get('http://localhost:3000/api/astock/concept', { timeout: 10000 });
    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function getIndustryBoard() {
  try {
    const response = await axios.get('http://localhost:3000/api/astock/industry', { timeout: 10000 });
    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    return {
      success: false,
      error: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  getStockRealtime,
  getIndexRealtime,
  getConceptBoard,
  getIndustryBoard
};
