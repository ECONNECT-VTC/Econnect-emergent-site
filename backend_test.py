#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta

class VTCPricingTester:
    def __init__(self, base_url="https://driver-platform-28.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.admin_token = None
        self.client_token = None
        self.driver_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.passed_tests = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            self.passed_tests.append(name)
            print(f"✅ {name}")
        else:
            self.failed_tests.append({"test": name, "details": details})
            print(f"❌ {name} - {details}")

    def make_request(self, method, endpoint, data=None, use_admin=False, use_client=False, use_driver=False):
        """Make API request with proper authentication"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)
            
            return response
        except Exception as e:
            print(f"Request failed: {str(e)}")
            return None

    def admin_login(self):
        """Login as admin"""
        print("\n🔐 Admin Login...")
        response = self.make_request('POST', 'auth/login', {
            'email': 'admin@econnect-vtc.com',
            'password': 'admin123'
        })
        
        if response and response.status_code == 200:
            print("✅ Admin login successful")
            return True
        else:
            print(f"❌ Admin login failed: {response.status_code if response else 'No response'}")
            return False

    def test_public_vehicle_categories(self):
        """Test GET /api/vehicle-categories returns 4 default categories"""
        print("\n📋 Testing Public Vehicle Categories...")
        response = self.make_request('GET', 'vehicle-categories')
        
        if not response:
            self.log_test("GET /api/vehicle-categories", False, "No response")
            return False
        
        success = response.status_code == 200
        if success:
            try:
                categories = response.json()
                expected_names = ["Berline", "Van", "Luxe", "Green"]
                expected_prices = {
                    "Berline": {"price_per_km": 2.50, "min_fare": 25.00},
                    "Van": {"price_per_km": 3.00, "min_fare": 35.00},
                    "Luxe": {"price_per_km": 4.00, "min_fare": 50.00},
                    "Green": {"price_per_km": 2.80, "min_fare": 30.00}
                }
                
                if len(categories) >= 4:
                    self.log_test("GET /api/vehicle-categories returns 4+ categories", True)
                    
                    found_names = [cat.get('name') for cat in categories]
                    for expected in expected_names:
                        if expected in found_names:
                            cat = next(c for c in categories if c['name'] == expected)
                            expected_data = expected_prices[expected]
                            
                            price_ok = abs(cat['price_per_km'] - expected_data['price_per_km']) < 0.01
                            min_fare_ok = abs(cat['min_fare'] - expected_data['min_fare']) < 0.01
                            
                            if price_ok and min_fare_ok:
                                self.log_test(f"{expected} category has correct pricing", True)
                            else:
                                self.log_test(f"{expected} category pricing", False, 
                                            f"Expected {expected_data}, got {cat['price_per_km']}/{cat['min_fare']}")
                        else:
                            self.log_test(f"Default category {expected} exists", False, "Category not found")
                else:
                    self.log_test("GET /api/vehicle-categories returns 4+ categories", False, 
                                f"Only {len(categories)} categories found")
            except Exception as e:
                self.log_test("Parse vehicle categories response", False, str(e))
        else:
            self.log_test("GET /api/vehicle-categories", False, f"Status {response.status_code}")
        
        return success

    def test_price_estimation(self):
        """Test POST /api/estimate-price calculates prices correctly"""
        print("\n💰 Testing Price Estimation...")
        
        test_cases = [
            {"distance": 5.0, "description": "Short distance (5km)"},
            {"distance": 15.0, "description": "Medium distance (15km)"},
            {"distance": 50.0, "description": "Long distance (50km)"}
        ]
        
        all_passed = True
        for case in test_cases:
            response = self.make_request('POST', f'estimate-price?distance_km={case["distance"]}&duration_minutes=30')
            
            if not response or response.status_code != 200:
                self.log_test(f"Price estimation - {case['description']}", False, 
                            f"Status {response.status_code if response else 'No response'}")
                all_passed = False
                continue
            
            try:
                estimates = response.json()
                if len(estimates) >= 4:
                    self.log_test(f"Price estimation returns estimates - {case['description']}", True)
                    
                    # Verify minimum fare logic
                    for estimate in estimates:
                        expected_base = case['distance'] * estimate['price_per_km']
                        expected_final = max(expected_base, estimate['min_fare'])
                        
                        if abs(estimate['final_price'] - expected_final) < 0.01:
                            self.log_test(f"Minimum fare applied correctly - {estimate['category_name']} at {case['distance']}km", True)
                        else:
                            self.log_test(f"Minimum fare logic - {estimate['category_name']}", False,
                                        f"Expected {expected_final}, got {estimate['final_price']}")
                            all_passed = False
                else:
                    self.log_test(f"Price estimation completeness - {case['description']}", False, 
                                f"Only {len(estimates)} estimates")
                    all_passed = False
            except Exception as e:
                self.log_test(f"Parse price estimates - {case['description']}", False, str(e))
                all_passed = False
        
        return all_passed

    def test_admin_vehicle_categories_crud(self):
        """Test admin CRUD operations for vehicle categories"""
        print("\n🔧 Testing Admin Vehicle Categories CRUD...")
        
        if not self.admin_login():
            self.log_test("Admin login for CRUD tests", False, "Login failed")
            return False
        
        # Test GET admin categories
        response = self.make_request('GET', 'admin/vehicle-categories')
        if not response or response.status_code != 200:
            self.log_test("GET /api/admin/vehicle-categories", False, 
                        f"Status {response.status_code if response else 'No response'}")
            return False
        
        self.log_test("GET /api/admin/vehicle-categories", True)
        original_categories = response.json()
        
        # Test CREATE
        new_category = {
            "name": "Test Category",
            "description": "Test category for automated testing",
            "price_per_km": 3.50,
            "min_fare": 40.00,
            "order": 99
        }
        
        response = self.make_request('POST', 'admin/vehicle-categories', new_category)
        if response and response.status_code == 200:
            self.log_test("Admin can create new vehicle category", True)
            created_category = response.json()
            created_id = created_category.get('id')
        else:
            self.log_test("Admin can create new vehicle category", False, 
                        f"Status {response.status_code if response else 'No response'}")
            return False
        
        # Test UPDATE
        update_data = {
            "price_per_km": 4.00,
            "min_fare": 45.00
        }
        
        response = self.make_request('PUT', f'admin/vehicle-categories/{created_id}', update_data)
        if response and response.status_code == 200:
            updated_category = response.json()
            if abs(updated_category['price_per_km'] - 4.00) < 0.01:
                self.log_test("Admin can update vehicle category (price, min fare)", True)
            else:
                self.log_test("Admin can update vehicle category (price, min fare)", False, "Price not updated")
        else:
            self.log_test("Admin can update vehicle category (price, min fare)", False, 
                        f"Status {response.status_code if response else 'No response'}")
        
        # Test TOGGLE ACTIVE/INACTIVE
        toggle_data = {"is_active": False}
        response = self.make_request('PUT', f'admin/vehicle-categories/{created_id}', toggle_data)
        if response and response.status_code == 200:
            self.log_test("Admin can toggle category active/inactive", True)
        else:
            self.log_test("Admin can toggle category active/inactive", False, 
                        f"Status {response.status_code if response else 'No response'}")
        
        # Test DELETE
        response = self.make_request('DELETE', f'admin/vehicle-categories/{created_id}')
        if response and response.status_code == 200:
            self.log_test("Admin can delete vehicle category", True)
        else:
            self.log_test("Admin can delete vehicle category", False, 
                        f"Status {response.status_code if response else 'No response'}")
        
        return True

    def test_client_booking_with_vehicle_selection(self):
        """Test client booking with vehicle selection and price estimation"""
        print("\n📝 Testing Client Booking with Vehicle Selection...")
        
        # Register test client
        test_email = f"test_client_{datetime.now().strftime('%H%M%S')}@test.com"
        client_data = {
            "email": test_email,
            "name": "Test Client",
            "phone": "+33123456789",
            "password": "testpass123"
        }
        
        response = self.make_request('POST', 'auth/register', client_data)
        if not response or response.status_code != 200:
            self.log_test("Client registration for booking test", False, 
                        f"Status {response.status_code if response else 'No response'}")
            return False
        
        self.log_test("Client registration for booking test", True)
        
        # Get vehicle categories
        response = self.make_request('GET', 'vehicle-categories')
        if not response or response.status_code != 200:
            self.log_test("Get categories for booking", False, "Failed to get categories")
            return False
        
        categories = response.json()
        if not categories:
            self.log_test("Categories available for booking", False, "No categories found")
            return False
        
        # Get price estimates
        distance = 20.0
        response = self.make_request('POST', f'estimate-price?distance_km={distance}&duration_minutes=45')
        if not response or response.status_code != 200:
            self.log_test("Get price estimates for booking", False, "Failed to get estimates")
            return False
        
        estimates = response.json()
        if not estimates:
            self.log_test("Price estimates available for booking", False, "No estimates found")
            return False
        
        # Create booking with vehicle selection
        selected_category = categories[0]
        selected_estimate = estimates[0]
        
        booking_data = {
            "pickup_address": "123 Rue de la Paix, Paris",
            "dropoff_address": "456 Avenue des Champs, Paris",
            "pickup_date": "25/12/2024",
            "pickup_time": "14:30",
            "transfer_type": "simple",
            "vehicle_category_id": selected_category['id'],
            "distance_km": distance,
            "duration_minutes": 45,
            "estimated_price": selected_estimate['final_price'],
            "notes": "Test booking from automated test"
        }
        
        response = self.make_request('POST', 'bookings', booking_data)
        if response and response.status_code == 200:
            booking = response.json()
            
            # Verify booking saved with correct data
            if (booking.get('vehicle_category_id') == selected_category['id'] and 
                abs(booking.get('estimated_price', 0) - selected_estimate['final_price']) < 0.01):
                self.log_test("Booking is saved with vehicle_category_id and estimated_price", True)
            else:
                self.log_test("Booking is saved with vehicle_category_id and estimated_price", False, 
                            "Missing or incorrect vehicle/price data")
        else:
            self.log_test("Client can select vehicle category when booking", False, 
                        f"Status {response.status_code if response else 'No response'}")
            return False
        
        return True

    def run_all_tests(self):
        """Run all VTC pricing system tests"""
        print("🚗 VTC Pricing System API Testing")
        print("=" * 50)
        
        tests = [
            ("Public Vehicle Categories", self.test_public_vehicle_categories),
            ("Price Estimation", self.test_price_estimation),
            ("Admin Vehicle Categories CRUD", self.test_admin_vehicle_categories_crud),
            ("Client Booking with Vehicle Selection", self.test_client_booking_with_vehicle_selection)
        ]
        
        for test_name, test_func in tests:
            print(f"\n{'='*20} {test_name} {'='*20}")
            try:
                test_func()
            except Exception as e:
                self.log_test(f"{test_name} (Exception)", False, str(e))
        
        # Print summary
        print(f"\n{'='*50}")
        print(f"📊 Final Results: {self.tests_passed}/{self.tests_run} tests passed")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ Failed Tests:")
            for failed in self.failed_tests:
                print(f"  - {failed['test']}: {failed['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = VTCPricingTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())