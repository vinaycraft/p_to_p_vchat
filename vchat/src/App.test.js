import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: jest.fn().mockRejectedValue(
        Object.assign(new Error('denied'), { name: 'NotAllowedError' })
      ),
    },
    configurable: true,
  });
});

test('shows friendly message when camera is denied', async () => {
  render(<App />);
  await waitFor(() => {
    expect(
      screen.getByRole('heading', { name: /allow camera & microphone/i })
    ).toBeInTheDocument();
  });
});
